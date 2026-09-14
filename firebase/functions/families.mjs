import {FieldPath} from 'firebase-admin/firestore';
import {categories, classification} from './catalog.mjs';
import {ApiError, MIB, hash, randomUUID, text, integer, identifier, cursorDecode, cursorEncode} from './core.mjs';

export function createFamilies(db, bucket, config, limits, clock = Date.now) {
  const collection = db.collection('families'), usage = db.collection('usage').doc('storage');
  const now = () => Math.floor(clock() / 1000);
  const requireFamily = snapshot => {
    const f = snapshot.data();
    if (!f || f.owner !== config.owner) throw new ApiError(404, 'Familia no disponible.');
    return f;
  };
  async function remove(key) {
    try { await bucket.file(key).delete({ignoreNotFound: true}); }
    catch {
      // Record a cleanup job; the operator tool processes at most 100 jobs per run.
      await db.collection('objectCleanup').doc(hash(key)).set({key, created: now()});
    }
  }
  return {
    async list(url, client) {
      const count = integer(url.searchParams.get('limit') || 100, 1, 200), cursor = cursorDecode(url.searchParams.get('cursor'));
      const year = integer(url.searchParams.get('revit') || 2027, 2024, 2027);
      let query = collection.where('owner', '==', config.owner);
      if (client) query = query.where('published', '==', 1);
      query = query.orderBy('updated', 'desc').orderBy(FieldPath.documentId(), 'desc');
      if (cursor) query = query.startAfter(...cursor);
      const result = await query.limit(count + 1).get(), docs = result.docs.slice(0, count);
      return {families: docs.filter(doc => !client || doc.data().revit <= year).map(doc => {
        const f = doc.data();
        return {id: doc.id, name: f.name, category: f.category, subcategory: f.subcategory, description: f.description, revit: f.revit, revision: f.revision,
          size: f.size, sha256: f.sha256, published: f.published, updated: f.updated, hasThumbnail: Boolean(f.thumbnail_key)};
      }), nextCursor: result.size > count ? cursorEncode(docs.at(-1), 'updated') : null};
    },
    async download(id, kind, url, client, revalidate) {
      const ref = collection.doc(identifier(id)), f = requireFamily(await ref.get());
      if (client && !f.published) throw new ApiError(404, 'Familia no disponible.');
      if (client && f.revit > integer(url.searchParams.get('revit'), 2024, 2027)) throw new ApiError(409, 'La familia requiere una versión posterior de Revit.');
      const key = kind === 'file' ? f.object_key : f.thumbnail_key;
      if (!key) throw new ApiError(404, 'Vista previa no disponible.');
      const object = bucket.file(key);
      let metadata;
      try { [metadata] = await object.getMetadata(); } catch (error) { if (Number(error.code) === 404) throw new ApiError(404, 'Archivo no disponible.'); throw error; }
      const size = Number(metadata.size), maximum = (kind === 'file' ? 25 : 2) * MIB;
      if (!Number.isSafeInteger(size) || size < 1 || size > maximum) throw new ApiError(413, 'El archivo supera el tamaño permitido.');
      await limits.reserveDownload(size);
      let data;
      try { [data] = await bucket.file(key, {generation: metadata.generation}).download({validation: 'crc32c'}); }
      catch (error) { if (Number(error.code) === 404) throw new ApiError(404, 'El archivo cambió. Actualiza la biblioteca.'); throw error; }
      if (data.length !== size || (kind === 'file' && hash(data) !== f.sha256)) throw new ApiError(503, 'No se pudo verificar la integridad del archivo.');
      if (client) {
        await revalidate();
        const latest = requireFamily(await ref.get());
        if (!latest.published || latest.object_key !== f.object_key || latest.thumbnail_key !== f.thumbnail_key) throw new ApiError(409, 'La familia cambió. Actualiza la biblioteca.');
      }
      const headers = {'Cache-Control': 'private, no-store', 'Content-Length': String(data.length), 'X-Content-Type-Options': 'nosniff',
        'Content-Type': kind === 'file' ? 'application/octet-stream' : metadata.contentType};
      if (kind === 'file') { headers['Content-Disposition'] = `attachment; filename="${id}.rfa"`; headers['X-Content-SHA256'] = f.sha256; }
      else if (!['image/png', 'image/jpeg'].includes(metadata.contentType)) throw new ApiError(415, 'La miniatura no es PNG o JPG.');
      return new Response(data, {headers});
    },
    async save(form) {
      const name = text(form.get('name')), revit = integer(form.get('revit'), 2024, 2027), description = String(form.get('description') || '').slice(0, 1500);
      const {category, subcategory} = classification(text(form.get('category')), String(form.get('subcategory') || ''));
      if (!categories.find(c => c.id === category)?.subcategories.some(c => c.id === subcategory)) throw new ApiError(400, 'Selecciona una categoría y una subcategoría válidas.');
      const existingId = form.get('id'), id = existingId ? identifier(existingId) : randomUUID(), ref = collection.doc(id);
      const old = existingId ? requireFamily(await ref.get()) : null;
      const file = form.get('file'), hasFile = file instanceof File && file.size > 0;
      if (!hasFile && !old) throw new ApiError(400, 'Adjunta un archivo .rfa de hasta 25 MB.');
      let data = null, preview = null, previewType = '';
      if (hasFile) {
        if (!file.name.toLowerCase().endsWith('.rfa') || file.size < 8 || file.size > 25 * MIB) throw new ApiError(400, 'Adjunta un archivo .rfa de hasta 25 MB.');
        data = Buffer.from(await file.arrayBuffer());
        if (data.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1') throw new ApiError(400, 'El archivo no tiene el contenedor esperado de una familia Revit.');
      }
      const thumbnail = form.get('thumbnail');
      if (thumbnail instanceof File && thumbnail.size > 0) {
        if (thumbnail.size > 2 * MIB) throw new ApiError(400, 'La miniatura debe pesar hasta 2 MB.');
        preview = Buffer.from(await thumbnail.arrayBuffer());
        if (preview.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') previewType = 'image/png';
        else if (preview.subarray(0, 3).toString('hex') === 'ffd8ff') previewType = 'image/jpeg';
        else throw new ApiError(400, 'Usa una miniatura PNG o JPG válida.');
      }
      const prefix = `families/${config.owner}/${id}/`;
      const objectKey = data ? prefix + randomUUID() + '.rfa' : old.object_key;
      const thumbnailKey = preview ? prefix + randomUUID() + (previewType === 'image/png' ? '.png' : '.jpg') : old?.thumbnail_key || null;
      const value = {owner: config.owner, name, category, subcategory, description, revit, revision: (old?.revision || 0) + (data ? 1 : 0),
        object_key: objectKey, thumbnail_key: thumbnailKey, thumbnail_size: preview?.length ?? old?.thumbnail_size ?? 0,
        size: data?.length ?? old.size, sha256: data ? hash(data) : old.sha256, published: old?.published ?? 1, updated: now(), etag: randomUUID()};
      const added = [], delta = value.size + value.thumbnail_size - (old ? old.size + (old.thumbnail_size || 0) : 0);
      if (((await usage.get()).data()?.bytes || 0) + delta > config.storageBytes) throw new ApiError(409, 'La biblioteca alcanzó su límite de almacenamiento.', 'STORAGE_LIMIT');
      try {
        for (const [key, bytes, type] of [[objectKey, data, 'application/octet-stream'], [thumbnailKey, preview, previewType]]) if (bytes) {
          await bucket.file(key).save(bytes, {resumable: false, validation: 'crc32c', preconditionOpts: {ifGenerationMatch: 0}, metadata: {contentType: type, cacheControl: 'private, no-store'}});
          added.push(key);
        }
        await db.runTransaction(async tx => {
          const [current, stats] = await tx.getAll(ref, usage);
          if (old ? !current.exists || current.data().etag !== old.etag : current.exists) throw new ApiError(409, 'Otra sesión actualizó esta familia. Recarga y vuelve a intentarlo.');
          const bytes = (stats.data()?.bytes || 0) + delta;
          if (bytes > config.storageBytes) throw new ApiError(409, 'La biblioteca alcanzó su límite de almacenamiento. Revisa el consumo antes de ampliarlo.', 'STORAGE_LIMIT');
          tx.set(ref, value); tx.set(usage, {bytes: Math.max(0, bytes), updated: now()});
        });
      } catch (error) { for (const key of added) await remove(key); throw error; }
      for (const key of [old?.object_key, old?.thumbnail_key]) if (key && key !== objectKey && key !== thumbnailKey) await remove(key);
      return {id};
    },
    async publish(id, published) {
      if (typeof published !== 'boolean') throw new ApiError(400, 'Estado inválido.');
      const ref = collection.doc(identifier(id));
      await db.runTransaction(async tx => { requireFamily(await tx.get(ref)); tx.update(ref, {published: published ? 1 : 0, updated: now(), etag: randomUUID()}); });
      return {ok: true};
    },
  };
}

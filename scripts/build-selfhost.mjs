import ts from 'typescript';
import {readFile,writeFile} from 'node:fs/promises';
for(const name of ['service','catalog']){
 const source=await readFile(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace('"./catalog"','"./catalog.mjs"');
 await writeFile(new URL('../selfhost/'+name+'.mjs',import.meta.url),compiled);
}
console.log('Servicio portable preparado.');

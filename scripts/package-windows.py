"""Package source plus the prebuilt portable portal; never manufacture an EXE."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile
import sys

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
commercial = '--commercial' in sys.argv[1:]
label = f'FAMBIT-Preparacion-Comercial-{version}' if commercial else f'FAMBIT-Prueba-Windows-{version}'
destination = root / 'public' / 'downloads' / f'{label}.zip'
names = subprocess.check_output(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root
).decode().split('\0')
files = {root / name for name in names if name and not name.startswith('public/downloads/')}
files |= {p for p in (root / 'selfhost' / 'dist').rglob('*')
          if p.is_file() and 'downloads' not in p.relative_to(root / 'selfhost' / 'dist').parts}
files |= {root / 'selfhost' / 'service.mjs', root / 'selfhost' / 'catalog.mjs', root / 'next-env.d.ts'}
files = {p for p in files if p.is_file() and not p.is_symlink()}
required = ['Preparar-Prueba.cmd', 'Iniciar-Servidor-Local.cmd', 'installer/build.ps1',
            'revit/NubeBIM/LibraryPane.xaml', 'revit/NubeBIM/LibraryPane.xaml.cs',
            'revit/NubeBIM/FamilyPlacement.cs', 'revit/NubeBIM/RevitEventBridge.cs',
            'revit/NubeBIM/Assets/fambit-mark.png', 'public/brand/fambit-mark.png',
            'revit/NubeBIM/Fonts/Inter-Medium.ttf', 'revit/NubeBIM/Fonts/Inter-SemiBold.ttf',
            'revit/NubeBIM/Fonts/Inter-Regular.ttf', 'revit/NubeBIM/Fonts/Inter-Bold.ttf',
            'revit/NubeBIM/Fonts/OFL-Inter.txt', 'public/fonts/Inter-Variable.ttf',
            'selfhost/dist/brand/fambit-mark.png', 'selfhost/dist/index.html', 'selfhost/dist/fonts/Inter-Variable.ttf',
            'selfhost/service.mjs', 'selfhost/catalog.mjs', 'docs/PRUEBA-WINDOWS.md',
            'drizzle/0001_fambit_subcategories.sql']
if commercial:
    required += ['Configurar-Servidor.cmd', 'Preparar-Instalador-Comercial.cmd',
                 'ABRIR-GUIA-PUBLICACION.html', 'installer/produccion.ps1',
                 'installer/configurar-servidor.ps1', 'installer/firmar.ps1',
                 'render.yaml', 'Dockerfile', '.dockerignore', 'selfhost/auth.mjs',
                 'selfhost/pages.mjs', 'selfhost/backup.mjs', 'selfhost/provision.mjs',
                 'selfhost/web/login.js', 'selfhost/web/portal.css', 'docs/PUBLICAR-FAMBIT.md']
for name in required:
    assert root / name in files, f'Missing {name}; rebuild the portable portal before packaging.'
for p in files:
    assert p.suffix.lower() not in {'.exe', '.dll', '.rfa', '.sqlite', '.pem', '.pfx', '.key', '.env'}, p
    assert p.name == '.env.example' or not p.name.startswith('.env'), p
    assert not {'node_modules', '.git', '.sites-runtime', 'server-data', 'artifacts'} & set(p.relative_to(root).parts), p
for name in required[:2] + (['Configurar-Servidor.cmd', 'Preparar-Instalador-Comercial.cmd'] if commercial else []):
    data = (root / name).read_bytes()
    assert b'\r\n' in data and b'\n' not in data.replace(b'\r\n', b''), f'Preserve Windows CRLF in {name}'
destination.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for p in sorted(files):
        info = zipfile.ZipInfo(label + '/' + p.relative_to(root).as_posix(), (2026, 9, 11, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, p.read_bytes())
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
    for p in files:
        assert archive.read(label + '/' + p.relative_to(root).as_posix()) == p.read_bytes()
checksum = hashlib.sha256(destination.read_bytes()).hexdigest()
destination.with_suffix('.zip.sha256').write_text(checksum + '  ' + destination.name + '\n')
print(json.dumps({'package': str(destination), 'files': len(files), 'bytes': destination.stat().st_size,
                  'sha256': checksum, 'contains_exe': False}, ensure_ascii=False))

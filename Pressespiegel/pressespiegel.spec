# -*- mode: python ; coding: utf-8 -*-

import sys

app_icon = 'FD_Icon_orange-white_1024.icns' if sys.platform == 'darwin' else 'FD_Icon_orange-white.ico'


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('FD_Icon_orange-white.png', '.'),
        ('FD_Icon_orange-white.ico', '.'),
        ('FD_Icon_orange-white_1024.icns', '.'),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='pressespiegel',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=app_icon,
)

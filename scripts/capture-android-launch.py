"""Capture the installed app after the title menu becomes visible."""
import subprocess
import time
from pathlib import Path

deadline = time.monotonic() + 45
while time.monotonic() < deadline:
    subprocess.run(
        ['adb', 'shell', 'uiautomator', 'dump', '--compressed', '/sdcard/thread-window.xml'],
        check=True, stdout=subprocess.DEVNULL, timeout=20,
    )
    tree = subprocess.check_output(
        ['adb', 'exec-out', 'cat', '/sdcard/thread-window.xml'], timeout=5,
    )
    if b'TRACK ARCHIVE' in tree and b'GENERATE TRACK' in tree:
        image = subprocess.check_output(['adb', 'exec-out', 'screencap', '-p'], timeout=10)
        assert image.startswith(b'\x89PNG\r\n\x1a\n'), 'Invalid launch screenshot'
        Path('android-launch.png').write_bytes(image)
        print('Installed THREAD opens to its title menu offline.')
        break
    time.sleep(1)
else:
    raise SystemExit('Installed app did not show its title menu within 45 seconds')

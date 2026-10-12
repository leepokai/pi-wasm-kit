#!/usr/bin/env python3
"""Real emulator/device UI E2E. Requires installed debug APK, adb reverse and preview server."""
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET

ADB = os.environ.get('ADB', 'adb')
PACKAGE = 'com.leepokai.piwasm.example'
COMPONENT = PACKAGE + '/com.leepokai.piwasm.MainActivity'

def adb(*args):
    return subprocess.check_output([ADB, *args], text=True, timeout=20).strip()

def nodes():
    adb('shell', 'uiautomator', 'dump', '/sdcard/pi-wasm-ui.xml')
    return list(ET.fromstring(adb('shell', 'cat', '/sdcard/pi-wasm-ui.xml')).iter('node'))

def wait(description, check, timeout=45):
    deadline = time.monotonic() + timeout
    last = []
    automation_error = None
    while time.monotonic() < deadline:
        try:
            last = nodes()
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ET.ParseError) as error:
            automation_error = error
            time.sleep(.5)
            continue
        if dismiss_anr(last): continue
        found = check(last)
        if isinstance(found, ET.Element) or found: return found
        time.sleep(.2)
    raise AssertionError(description + ': ' + str([n.attrib.get('text') for n in last]) + ' automation error: ' + str(automation_error))

def tap(node):
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))

def dismiss_anr(items):
    # Cold CI emulators can show a system "isn't responding" dialog (e.g. the launcher) over the app.
    if not any("isn't responding" in n.get('text', '') for n in items): return False
    button = next((n for n in items if n.get('text', '').lower() == 'wait'), None)
    if button is not None: tap(button); time.sleep(1)
    return button is not None

def label(items, name):
    return next((n.get('text', '') for n in items if n.get('content-desc') == name), '')

def ready():
    wait('runtime ready', lambda items: 'Ready' in label(items, 'runtimeStatus'))

def run():
    # An `input tap` on a busy emulator is occasionally dropped; tap again only if no run started.
    for attempt in range(3):
        before = {}
        def enabled(items):
            before['result'] = label(items, 'runtimeResult')
            return next((n for n in items if n.get('class') == 'android.widget.Button' and n.get('text', '').lower() == 'run task' and n.get('enabled') == 'true'), None)
        tap(wait('run button', enabled))
        try:
            wait('run started', lambda items: 'Running' in label(items, 'runtimeStatus') or label(items, 'runtimeResult') != before['result'], timeout=15)
            return
        except AssertionError:
            print(f'Run tap {attempt + 1} did not start a task; tapping again', flush=True)
    raise AssertionError('Run task did not start after 3 taps')

def launch():
    adb('shell', 'am', 'start', '-W', '-n', COMPONENT)

def stop():
    adb('shell', 'am', 'force-stop', PACKAGE)

adb('reverse', 'tcp:4173', 'tcp:4173')
stop(); launch(); ready(); run()
wait('native tool executed', lambda items: 'Android native tool' in label(items, 'nativeProof'))
ready()
saved = wait('completed answer', lambda items: label(items, 'runtimeResult') if '21 × 2 = 42' in label(items, 'runtimeResult') else None)
stop(); launch(); ready()
wait('persisted answer with no native replay', lambda items: label(items, 'runtimeResult') == saved and 'native calls this launch: 0' in label(items, 'nativeProof'))
run()
wait('active submission before interruption', lambda items: 'Running' in label(items, 'runtimeStatus'))
stop(); launch()
wait('unfinished submission recovered', lambda items: 'Ready' in label(items, 'runtimeStatus') and '21 × 2 = 42' in label(items, 'runtimeResult') and label(items, 'runtimeResult') != saved)
print('PASS: native tool → persisted result → process restart without replay → interrupted submission recovery')

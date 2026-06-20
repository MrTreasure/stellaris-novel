import os, re

steam = r'e:\steam'
vdf_path = os.path.join(steam, 'config', 'libraryfolders.vdf')
if os.path.exists(vdf_path):
    with open(vdf_path, 'rb') as f:
        content = f.read().decode('utf-8', errors='replace')
    for m in re.finditer(r'"path"\s+"([^"]+)"', content):
        p = m.group(1).replace(chr(92)*2, chr(92))
        test = os.path.join(p, 'steamapps', 'common', 'Stellaris')
        print(f'Check: {test}')
        if os.path.exists(test):
            print(f'FOUND: {test}')
            for item in sorted(os.listdir(test)):
                print(f'  {item}')
            break
else:
    print(f'VDF not found')

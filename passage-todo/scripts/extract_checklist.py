"""Read the supplied workbook without changing it; omit Excel phonetic guides."""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
FIELDS = ['category', 'title', 'start', 'deadline', 'place', 'equipment',
          'contact', 'caution', 'status', 'revision', 'pdf']


def visible_text(element):
    return ''.join(t.text or '' for t in element.findall('m:t', NS)
                   + element.findall('m:r/m:t', NS))


def extract(path):
    with zipfile.ZipFile(path) as archive:
        strings = [visible_text(s) for s in ET.fromstring(
            archive.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        result = []
        for row in sheet.findall('.//m:row', NS):
            number = int(row.attrib['r'])
            if number == 1:
                continue
            values = {}
            for cell in row.findall('m:c', NS):
                column = ''.join(c for c in cell.attrib['r'] if c.isalpha())
                value = cell.find('m:v', NS)
                text = value.text if value is not None else ''
                if cell.get('t') == 's':
                    text = strings[int(text)]
                elif cell.get('t') == 'inlineStr':
                    text = visible_text(cell.find('m:is', NS))
                values[column] = text
            if values.get('B'):
                result.append(dict(id=f'excel-{number}', row=number,
                    **{field: values.get(chr(65 + i), '') for i, field in enumerate(FIELDS)}))
        return result


if __name__ == '__main__':
    rows = extract(sys.argv[1])
    target = Path(__file__).resolve().parents[1] / 'checklist.js'
    target.write_text('// Source: バック業務確認チェックリスト.xlsx / 業務確認チェックリスト\n'
        '// Visible cell text preserved. Phonetic guides are not cell content.\n'
        '(function(root) {\n  const rows = ' + json.dumps(rows, ensure_ascii=False, indent=2)
        + ';\n  if (typeof module === "object" && module.exports) module.exports = rows;\n'
        + '  else root.PassageChecklist = rows;\n})(typeof globalThis !== "undefined" ? globalThis : this);\n', encoding='utf-8')
    print(f'{len(rows)} rows extracted to {target}')

import { Workbook } from '@oai/artifact-tool';
const wb = Workbook.create();
console.log(wb.help('render', { include: 'schema,examples,notes', maxChars: 4500 }).ndjson);

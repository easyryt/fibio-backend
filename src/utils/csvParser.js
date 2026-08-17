import { parse } from "csv-parse/sync";

export const parseCsvBuffer = (buffer) => {
  const records = parse(buffer, {
    columns: true, // use the first row as object keys
    skip_empty_lines: true,
    trim: true,
  });
  return records;
};
interface LogFields { [k: string]: any }

const base = (level: string, msg: string, fields?: LogFields) => {
  const entry: any = { level, msg, time: new Date().toISOString() };
  if (fields) entry.fields = fields;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
};

export const logger = {
  info: (msg: string, f?: LogFields) => base('info', msg, f),
  warn: (msg: string, f?: LogFields) => base('warn', msg, f),
  error: (msg: string, f?: LogFields) => base('error', msg, f)
};

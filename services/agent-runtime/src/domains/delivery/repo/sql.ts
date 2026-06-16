export interface Sql {
  <Row = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<Row[]>;
}

export type SqlQuery<Row = unknown> = Promise<Row[]>;

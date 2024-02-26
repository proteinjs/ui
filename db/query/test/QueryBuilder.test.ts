import { QueryBuilder } from '../src/QueryBuilder';

describe('QueryBuilder - Factory tests', () => {
  interface Employee {
    id: number;
    name: string;
    age: number;
    country: string;
  }

  const tableName = 'Employee';

  test('fromObject API', () => {
    const queryObject = {
      name: 'John Doe',
      country: 'USA'
    };

    const qb = QueryBuilder.fromObject<Employee>(queryObject, tableName);

    // Standard SQL output
    let result = qb.toSql();
    const expectedSQL = "SELECT * FROM Employee WHERE name = 'John Doe' AND country = 'USA';";
    expect(result.sql).toBe(expectedSQL);

    // SQL output with positional parameters
    result = qb.toSql({ useParams: true });
    expect(result.sql).toContain("SELECT * FROM Employee WHERE name = ? AND country = ?;");
    expect(result.params).toEqual(['John Doe', 'USA']);

    // SQL output with named parameters and types
    result = qb.toSql({ useParams: true, useNamedParams: true });
    expect(result.sql).toContain("SELECT * FROM Employee WHERE name = @param0 AND country = @param1;");
    expect(result.namedParams?.params).toEqual({ param0: 'John Doe', param1: 'USA' });
    expect(result.namedParams?.types).toEqual({ param0: 'string', param1: 'string' });
  });
});

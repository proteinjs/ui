import knex from 'knex';
import { DbDriver, Record, Table, Row, SerializedQueryCondition, SerializedQuery } from '@proteinjs/db';
import { loadTables } from './loadTables';
import { getMysqlConfig } from './MysqlConfig';
import { Logger } from '@brentbahry/util';

export class MysqlDriver implements DbDriver {
	private static CONFIG: any;
	private static DB_NAME: string;
	private static knex: knex;
	private static logger = new Logger('MysqlDriver');

	private static getConfig() {
		if (!MysqlDriver.CONFIG) {
			const mysqlConfig = getMysqlConfig();
			MysqlDriver.CONFIG = {
				client: 'mysql',
				connection: {
					host: mysqlConfig.host,
					user: mysqlConfig.user,
					password: mysqlConfig.password,
				}
			};
		}
		
		return MysqlDriver.CONFIG;
	}

	static getKnex(): any {
		if (!MysqlDriver.knex)
			MysqlDriver.knex = knex(MysqlDriver.getConfig());

		return MysqlDriver.knex;
	}

	static getDbName() {
		if (!MysqlDriver.DB_NAME)
			MysqlDriver.DB_NAME = getMysqlConfig().dbName;

		return MysqlDriver.DB_NAME;
	}

	private select(table: Table<any>) {
		return MysqlDriver.getKnex().withSchema(MysqlDriver.getDbName()).select().from(table.name);
	}

	async init(): Promise<void> {
		await this.createDatabaseIfNotExists(MysqlDriver.getDbName());
		await this.setMaxAllowedPacketSize();
		await loadTables();
	}

	async tableExists<T extends Record>(table: Table<T>): Promise<boolean> {
		return await MysqlDriver.getKnex().schema.withSchema(MysqlDriver.getDbName()).hasTable(table.name);
	}

	private async createDatabaseIfNotExists(databaseName: string): Promise<void> {
		if (await this.databaseExists(databaseName))
			return;

		await MysqlDriver.getKnex().raw(`CREATE DATABASE ${databaseName};`);
	}

	private async databaseExists(databaseName: string): Promise<boolean> {
		const result: any = await MysqlDriver.getKnex().raw('SHOW DATABASES;');
		for (const existingDatabase of result[0]) {
			if (existingDatabase['Database'] == databaseName)
        return true;
		}

		return false;
	}

	private async setMaxAllowedPacketSize(): Promise<void> {
		await MysqlDriver.getKnex().raw('SET GLOBAL max_allowed_packet=1073741824;');
		await MysqlDriver.getKnex().destroy();
		MysqlDriver.knex = knex(MysqlDriver.CONFIG);
		MysqlDriver.logger.info('Set global max_allowed_packet size to 1gb');
	}

	async get<T extends Record>(table: Table<T>, query: SerializedQuery): Promise<Row> {
		return (await this.query(table, query))[0];
	}

	async insert<T extends Record>(table: Table<T>, row: Row): Promise<void> {
		await MysqlDriver.getKnex().withSchema(MysqlDriver.getDbName()).insert(row).into(table.name).returning('*');
	}

	async update<T extends Record>(table: Table<T>, row: Row, query: SerializedQuery): Promise<number> {
		let queryBuilder = MysqlDriver.getKnex().withSchema(MysqlDriver.getDbName()).update(row).into(table.name);
		return await this.where(queryBuilder, query);
	}

	async delete<T extends Record>(table: Table<T>, query: SerializedQuery): Promise<number> {
		let queryBuilder = MysqlDriver.getKnex().withSchema(MysqlDriver.getDbName()).delete().from(table.name);
		return await this.where(queryBuilder, query);
	}

	async query<T extends Record>(table: Table<T>, query: SerializedQuery, sort?: { column: string, desc?: boolean, byValues?: string[] }[], window?: { start: number, end: number }): Promise<Row[]> {
		const select = this.select(table);
		if (sort) {
			for (let sortCondition of sort) {
				if (sortCondition.byValues) {
					const orderByValuesRaw = sortCondition.byValues.map(value => MysqlDriver.getKnex().raw('?', value)).join(', ');
					select.orderByRaw(`FIELD(${sortCondition.column}, ${orderByValuesRaw})`);
					continue;
				}

				select.orderBy(sortCondition.column, sortCondition.desc ? 'desc' : 'asc');
			}
		}

		if (window) {
			select.limit(window.end - window.start);
			select.offset(window.start);
		}

		return await this.where(select, query);
	}

	private async where(knexQueryBulder: any, query: SerializedQuery) {
		if (Array.isArray(query))
			return await this.queryWithConditions(knexQueryBulder, query);

		return await knexQueryBulder.where(query);
	}

	private async queryWithConditions(knexQueryBulder: any, queryConditions: SerializedQueryCondition[]): Promise<Row[]> {
		let select = knexQueryBulder;
		for (let queryCondition of queryConditions)
			select = select.where(queryCondition.column, queryCondition.operator, queryCondition.value);
		return await select;
	}

	async getRowCount<T extends Record>(table: Table<T>, query?: SerializedQuery): Promise<number> {
		const selectCount = this.select(table).count('* as total');
		if (query)
			return (await this.where(selectCount, query))[0].total;		

		return (await selectCount)[0].total;
	}
}
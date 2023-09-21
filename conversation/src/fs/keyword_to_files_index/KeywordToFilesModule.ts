import { Fs, Logger } from '@brentbahry/util';
import { ConversationModule } from '../../ConversationModule';
import { Function } from '../../Function';
import path from 'path';
import { searchFilesFunction } from './KeywordToFilesFunctions';

export type KeywordToFilesIndexModuleParams = {
  dir: string,
  keywordFilesIndex: { [keyword: string]: string[] /** file paths */ },
}

export class KeywordToFilesIndexModule implements ConversationModule {
  private logger = new Logger(this.constructor.name);
  params: KeywordToFilesIndexModuleParams;

  constructor(params: KeywordToFilesIndexModuleParams) {
    this.params = params;
  }

  searchFiles(params: { keyword: string }) {
    this.logger.info(`Searching for file, keyword: ${params.keyword}`);
    const filePaths = this.params.keywordFilesIndex[params.keyword];
    return filePaths || [];
  }

  getSystemMessages(): string[] {
    return [];
  }

  getFunctions(): Function[] {
    return [
      searchFilesFunction(this),
    ];
  }

  getMessageModerators() {
    return [];
  }
}

export class KeywordToFilesIndexModuleFactory {
  private static LOGGER = new Logger('KeywordToFilesIndexModuleFactory');

  static async createModule(dir: string): Promise<KeywordToFilesIndexModule> {
    this.LOGGER.info(`Creating module for dir: ${dir}`);
    let repoParams: KeywordToFilesIndexModuleParams = { keywordFilesIndex: {}, dir };
    repoParams.keywordFilesIndex = await this.createKeywordFilesIndex(dir, ['**/node-typescript-parser/**']);
    this.LOGGER.info(`Created module for dir: ${dir}`);
    return new KeywordToFilesIndexModule(repoParams);
  }

  /**
   * Create keyword-files index for the given base directory.
   * 
   * @param baseDir - The directory to start the file search from.
   * @returns An index with keywords mapped to file paths.
   */
  private static async createKeywordFilesIndex(baseDir: string, globIgnorePatterns: string[] = []): Promise<{ [keyword: string]: string[] }> {
    const logger = new Logger('createKeywordFilesIndex');
    // Ensure the base directory has a trailing slash
    if (!baseDir.endsWith(path.sep)) {
        baseDir += path.sep;
    }

    // Get all file paths, recursively, excluding node_modules and dist directories
    const filePaths = await Fs.getFilePaths(baseDir, ['**/node_modules/**', '**/dist/**']);

    const keywordFilesIndex: { [keyword: string]: string[] } = {};

    // Process each file path
    for (const filePath of filePaths) {
        const fileName = path.parse(filePath).name; // Get file name without extension

        if (!keywordFilesIndex[fileName]) {
            keywordFilesIndex[fileName] = [];
        }
        
        logger.debug(`fileName: ${fileName}, filePath: ${filePath}`);
        keywordFilesIndex[fileName].push(filePath);
    }

    return keywordFilesIndex;
  }
}

import fs from 'fs';
import path from 'path';
import { EmittedStyles } from './EmittedStyles';
import { ReadingEdge } from './ReadingEdge';

/** Where the seat's text and the cells start, and the toolbar's own paddings, at one viewport width. */
export type TableDesktopEdges = {
  /** The title — or the selection count in its seat — from the table's side. */
  seatText: number;
  toolbarPaddingLeft: number;
  toolbarPaddingRight: number;
  toolbarMinHeight: number;
  /** The first data column's label and value, each from its own cell's side. */
  headCell: number;
  bodyCell: number;
};

/** The desktop posture's toolbar in one state (a palette mode, rows selected or not). */
export type TableDesktopFaceState = {
  /** Every rule the toolbar emitted, in cascade order: its enclosing media blocks and its declarations. */
  toolbarRules: { media: string[]; declarations: string }[];
  /** The title cell's inline style, as rendered. */
  titleCellStyle: string;
  /** Keyed by viewport width in pixels. */
  edges: { [width: string]: TableDesktopEdges };
};

export type TableDesktopFaceRecording = {
  /** The revision whose render this recording was taken from. */
  recordedFrom: string;
  states: { [state: string]: TableDesktopFaceState };
};

/**
 * The DESKTOP posture's table toolbar as a recording: what it emits and where its text sits.
 *
 * A change that is meant for the phone posture alone proves it left the desktop alone by reading
 * the same face from its own render and comparing it with a recording taken from the revision it
 * started from — every emitted toolbar declaration, the title cell's inline style, and the
 * measured edges at a wide window, at the 600px line and in a narrow desktop window (a
 * fine-pointer window below 600px is still the desktop posture).
 *
 * To take a recording, render the revision to record with this file, `EmittedStyles`,
 * `ReadingEdge` and the suite that reads the face copied beside it, with
 * `RECORD_TABLE_DESKTOP_FACE=<revision>` set: the suite writes the file instead of comparing. A
 * change that MEANS to move the desktop re-records from its own render and says so.
 */
export class TableDesktopFace {
  static readonly WIDTHS = [1440, 600, 390];

  private static readonly RECORDING_PATH = path.join(__dirname, 'recordings', 'tableDesktopFace.json');

  /** The revision to record from, when this run records instead of comparing. */
  static recordingRevision(): string | undefined {
    return process.env.RECORD_TABLE_DESKTOP_FACE || undefined;
  }

  static recording(): TableDesktopFaceRecording {
    return JSON.parse(fs.readFileSync(TableDesktopFace.RECORDING_PATH, 'utf8'));
  }

  static write(recording: TableDesktopFaceRecording): void {
    fs.mkdirSync(path.dirname(TableDesktopFace.RECORDING_PATH), { recursive: true });
    fs.writeFileSync(TableDesktopFace.RECORDING_PATH, `${JSON.stringify(recording, null, 2)}\n`);
  }

  /** Reads the face from a rendered desktop table inside `container`. */
  static of(container: Element): TableDesktopFaceState {
    const toolbar = TableDesktopFace.required(container, '.MuiToolbar-root');
    const titleCell = toolbar.firstElementChild;
    if (!titleCell) {
      throw new Error('TableDesktopFace: the toolbar renders no title cell');
    }

    const seatText = TableDesktopFace.required(toolbar, 'h6, .MuiTypography-subtitle1');
    const headCell = TableDesktopFace.required(container, 'thead th:not(.MuiTableCell-paddingCheckbox)');
    const bodyCell = TableDesktopFace.required(container, 'tbody td:not(.MuiTableCell-paddingCheckbox)');

    const edges: { [width: string]: TableDesktopEdges } = {};
    for (const width of TableDesktopFace.WIDTHS) {
      const edge = new ReadingEdge(width);
      edges[String(width)] = {
        seatText: edge.of(seatText, container),
        toolbarPaddingLeft: edge.pixels(toolbar, 'padding-left'),
        toolbarPaddingRight: edge.pixels(toolbar, 'padding-right'),
        toolbarMinHeight: edge.pixels(toolbar, 'min-height'),
        headCell: edge.of(headCell, headCell.parentElement as Element),
        bodyCell: edge.of(bodyCell, bodyCell.parentElement as Element),
      };
    }

    return {
      toolbarRules: EmittedStyles.matching(toolbar).map((emitted) => ({
        media: emitted.media,
        declarations: emitted.rule.style.cssText,
      })),
      titleCellStyle: titleCell.getAttribute('style') || '',
      edges,
    };
  }

  private static required(root: Element, selector: string): Element {
    const found = root.querySelector(selector);
    if (!found) {
      throw new Error(`TableDesktopFace: nothing renders '${selector}'`);
    }

    return found;
  }
}

/**
 * The table's reading edge, in theme spacing units: how far a row's content starts from the
 * table's side. Both row faces read it (the grid's cells, the phone card list), and so does the
 * toolbar ON THE PHONE POSTURE: on a full-bleed phone page the table's side is the screen's, so
 * the title — or the selection count in its seat — starts on the same line the eye follows down
 * the rows.
 *
 * The desktop posture's toolbar does not read it: there the title keeps the framework toolbar's
 * own gutters (24px from 600px up) and its 4px inset, inside a card whose cells sit at this edge.
 */
export const TABLE_READING_EDGE = 2;

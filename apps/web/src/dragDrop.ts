/**
 * Custom MIME type used for HTML5 drag & drop of drawings between the
 * drawing grid and sidebar folder rows. A custom type (rather than
 * `text/plain`) prevents accidental drops into external targets and
 * lets drop zones distinguish drawing drags from file drags.
 */
export const DRAWING_DRAG_MIME = "application/x-excalistack-drawing";

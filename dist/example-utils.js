/* Shared by the offline loader and example-file builder. Preserve numeric precision. */
(function (root) {
  const api = {
    csvFromWorkbook(X, book) {
      return '\ufeff' + X.utils.sheet_to_csv(book.Sheets[book.SheetNames[0]], {rawNumbers: true, blankrows: true});
    }
  };
  root.MMFExampleUtils = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

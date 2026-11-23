/* A self-contained Blob worker works under file:// as well as HTTP(S).
 * No fetch, file-origin worker URL, importScripts or duplicated engine source. */
(function (root) {
  function start(args) {
    let worker = null;
    let blobUrl = null;
    let timer = null;
    let rejectPending;
    let settled = false;
    const cleanup = () => {
      if (worker) worker.terminate();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (timer !== null) clearTimeout(timer);
      worker = null;
      blobUrl = null;
    };
    const promise = new Promise((resolve, reject) => {
      rejectPending = reject;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error); else resolve(result);
      };
      const fallback = () => {
        cleanup();
        timer = setTimeout(() => {
          try { finish(null, root.MS1.match(...args)); }
          catch (error) { finish(error); }
        }, 0);
      };
      try {
        const source = `const match = ${root.MS1.match.toString()};
          self.onmessage = ({data}) => {
            try { self.postMessage({ok:true, result:match(...data)}); }
            catch(error) { self.postMessage({ok:false, error:error.message}); }
          };`;
        blobUrl = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
        worker = new Worker(blobUrl);
        worker.onmessage = ({data}) => finish(data.ok ? null : new Error(data.error), data.result);
        worker.onerror = event => { event.preventDefault(); fallback(); };
        worker.postMessage(args);
      } catch (_) {
        // Browsers restricting workers still support calculation on the main thread.
        fallback();
      }
    });
    return {promise, cancel() {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPending(new Error('Analysis cancelled because inputs changed.'));
    }};
  }
  root.MMFRunner = {start};
})(typeof window !== 'undefined' ? window : globalThis);

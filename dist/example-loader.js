/* Lazy loading keeps manuscript datasets off the initial page load.
 * HTTP reads the selected downloadable file. file:// reconstructs the original XLSX
 * from local script chunks and uses the shared CSV converter when CSV is selected. */
(function (root) {
  root.MMF_EXAMPLE_PARTS = {};
  const bytePromises = new Map();

  function script(url) {
    return new Promise((resolve, reject) => {
      const node = document.createElement('script');
      node.src = url;
      node.onload = () => { node.remove(); resolve(); };
      node.onerror = () => { node.remove(); reject(new Error('Could not load the example. Keep the complete dist/examples folder with this page.')); };
      document.head.append(node);
    });
  }

  function localBytes(id) {
    if (!bytePromises.has(id)) {
      const promise = (async () => {
        const example = root.MMF_EXAMPLES[id];
        root.MMF_EXAMPLE_PARTS[id] = [];
        for (const url of example.chunks) await script(url);
        const result = new Uint8Array(example.xlsx.bytes);
        let offset = 0;
        for (const part of root.MMF_EXAMPLE_PARTS[id]) {
          const binary = atob(part);
          for (let i = 0; i < binary.length; i++) result[offset++] = binary.charCodeAt(i);
        }
        delete root.MMF_EXAMPLE_PARTS[id];
        if (offset !== result.length) throw new Error('The local example is incomplete. Extract the complete web folder again.');
        return result;
      })().catch(error => { bytePromises.delete(id); throw error; });
      bytePromises.set(id, promise);
    }
    return bytePromises.get(id);
  }

  async function load(id, format) {
    const example = root.MMF_EXAMPLES[id];
    if (!example || !['xlsx', 'csv'].includes(format)) throw new Error('Select an example and a file format.');
    let book;
    if (location.protocol === 'file:') {
      const bytes = await localBytes(id);
      book = XLSX.read(bytes, {type: 'array'});
      if (format === 'csv') {
        const csv = root.MMFExampleUtils.csvFromWorkbook(XLSX, book);
        book = XLSX.read(csv, {type: 'string', raw: true});
      }
    } else {
      const response = await fetch(example[format].url);
      if (!response.ok) throw new Error(`Could not load ${example.stem}.${format} (${response.status}).`);
      book = format === 'csv'
        ? XLSX.read(await response.text(), {type: 'string', raw: true})
        : XLSX.read(await response.arrayBuffer(), {type: 'array'});
    }
    return {book, file: `${example.stem}.${format}`};
  }
  root.MMFExampleLoader = {load};
})(window);

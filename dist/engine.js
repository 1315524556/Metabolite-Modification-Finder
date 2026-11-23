/* Pure matching engine, shared by the browser worker and regression tests. */
(function (root) {
  function match(features, modifications, tolerance = 10, denominator = 'unknown', direction = 'both') {
    if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance >= 1000000) throw Error('Tolerance must be > 0 and < 1,000,000 ppm.');
    if (!['unknown','modification'].includes(denominator)) throw Error('Invalid denominator.');
    if (!['both','+','-'].includes(direction)) throw Error('Invalid direction.');
    const invalid = features.filter(x => !Number.isFinite(x.mz) || x.mz <= 0);
    if (invalid.length) throw Error(`Invalid feature m/z at spreadsheet row ${invalid[0].row}.`);
    const bad = modifications.find(x => !Number.isFinite(x.mass) || x.mass <= 0 || !String(x.name ?? '').trim());
    if (bad) throw Error(`Invalid modification name or mass at spreadsheet row ${bad.row}. Mass must be positive.`);
    const known = features.filter(x => String(x.name ?? '').trim());
    const unknown = features.filter(x => !String(x.name ?? '').trim()).sort((a,b) => a.mz-b.mz);
    if (!known.length || !unknown.length || !modifications.length) throw Error('Provide at least one named substrate, one unnamed feature, and one modification.');
    const lower = value => { let l=0,r=unknown.length; while(l<r){const m=(l+r)>>>1;if(unknown[m].mz<value)l=m+1;else r=m;}return l; };
    const results=[]; const t=tolerance/1e6;
    for(const s of known) for(const mod of modifications) for(const sign of (direction==='both'?['+','-']:[direction])) {
      const predicted=s.mz+(sign==='+'?mod.mass:-mod.mass);
      if(predicted<=0)continue;
      const low=denominator==='unknown'?predicted/(1+t):predicted-mod.mass*t;
      const high=denominator==='unknown'?predicted/(1-t):predicted+mod.mass*t;
      for(let i=lower(low-1e-10);i<unknown.length && unknown[i].mz<=high+1e-10;i++) {
        const u=unknown[i];const ppm=(u.mz-predicted)/(denominator==='unknown'?u.mz:mod.mass)*1e6;
        if(Math.abs(ppm)>tolerance+1e-8)continue;
        if(results.length>=1000000)throw Error('More than 1,000,000 matches. Reduce tolerance or split the input. No partial results are exported.');
        results.push({Substrate_Row:s.row,Substrate_NO:s.id,Substrate_Name:s.name,Substrate_mz:s.mz,Substrate_RT:s.rt,Unknown_Row:u.row,Unknown_NO:u.id,Unknown_mz:u.mz,Unknown_RT:u.rt,Modification_Row:mod.row,Modification_Type:mod.name,Neutral_Loss:mod.formula,Modification_Mass:mod.mass,Direction:sign,Predicted_mz:predicted,Mass_Error:u.mz-predicted,PPM_Error:ppm,Absolute_PPM:Math.abs(ppm),Delta_RT:typeof u.rt==='number'&&typeof s.rt==='number'?u.rt-s.rt:''});
      }
    }
    return {results,stats:{substrates:known.length,unknowns:unknown.length,modifications:modifications.length,matched:new Set(results.map(r=>r.Unknown_Row)).size}};
  }
  root.MS1={match}; if(typeof module!=='undefined')module.exports=root.MS1;
})(typeof self!=='undefined'?self:globalThis);

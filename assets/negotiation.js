/* SBS average rates are a separate source; never substitute accounting rates. */
window.createNegotiationView = function({el, fetchJSON, fmt, displayDate, themeColors, showToast}) {
  const root=el('negotiationView');
  const state={snapshots:new Map(),latest:'',selected:'',currency:'Dólar EE.UU.',range:30,chart:null,loaded:false,warning:''};
  const name=value=>String(value||'').replace(/D[oó]lar de N\.A\./gi,'Dólar EE.UU.');
  const number=value=>value!==null && value!==undefined && value!=='' && Number.isFinite(Number(value))?Number(value):null;
  const format=value=>number(value)===null?'—':fmt(number(value),4);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value:'';
  const empty=key=>({fecha_iso:key,oferta_demanda:[],mesa_bcr:[],mercado_profesional:[]});
  const spread=row=>number(row?.compra)!==null && number(row?.venta)!==null?number(row.venta)-number(row.compra):null;
  const current=()=>state.snapshots.get(state.selected)||empty('');
  const dates=()=>[...state.snapshots.keys()].sort();
  root.innerHTML=`
    <div class="neg-intro"><p><b>Negociación SBS</b> · Compra y venta en PEN por unidad de moneda. Datos de la fecha publicada.</p><a href="https://www.sbs.gob.pe/app/pp/sistip_portal/paginas/publicacion/tipocambiopromedio.aspx" target="_blank" rel="noopener noreferrer">Fuente SBS ↗</a></div>
    <div id="negMessage" class="neg-message" role="status" hidden></div>
    <div class="neg-kpis">
      <article class="neg-kpi"><span>USD · COMPRA</span><strong id="negBuy">—</strong><small>Dólar EE.UU. · PEN</small></article>
      <article class="neg-kpi"><span>USD · VENTA</span><strong id="negSell">—</strong><small>Dólar EE.UU. · PEN</small></article>
      <article class="neg-kpi"><span>USD · MERCADO PROFESIONAL</span><strong id="negFix">—</strong><small>Promedio ponderado · PEN</small></article>
      <article class="neg-kpi"><span>USD · SPREAD</span><strong id="negSpread">—</strong><small>Venta − compra · PEN</small></article>
    </div>
    <div class="neg-layout">
      <article class="panel neg-wide"><div class="panel-head"><div class="panel-title"><span class="title-icon"><i class="fa-solid fa-chart-line"></i></span><div><h2>Tendencia de negociación</h2><p id="negHistoryLabel">Cargando histórico…</p></div></div><div class="tools"><select id="negCurrency" aria-label="Moneda de negociación"></select><div id="negRanges" class="tabs"><button class="tab" data-range="15">15D</button><button class="tab active" data-range="30">30D</button><button class="tab" data-range="60">60D</button><button class="tab" data-range="120">120D</button></div></div></div><div class="panel-body"><div id="negTrendChart" class="chart"></div><p class="neg-note">PEN por unidad de moneda · Rango en fechas publicadas. El promedio ponderado corresponde al mercado profesional; no es el promedio simple de compra y venta.</p><details id="negSeriesValues"><summary>Ver valores de la serie</summary><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Compra</th><th>Venta</th><th>Prom. ponderado</th></tr></thead><tbody id="negSeriesTable"></tbody></table></div></details></div></article>
      <article class="panel"><div class="panel-head"><div class="panel-title"><span class="title-icon"><i class="fa-solid fa-right-left"></i></span><div><h2>Oferta y demanda</h2><p>Compra, venta y spread · PEN</p></div></div></div><div class="panel-body"><div class="table-tools"><input id="negSearch" class="search" placeholder="Buscar moneda" aria-label="Buscar moneda de negociación"></div><div class="table-wrap"><table><thead><tr><th>Moneda</th><th>Compra</th><th>Venta</th><th>Spread</th></tr></thead><tbody id="negRates"></tbody></table></div><p class="neg-note">— indica un dato no publicado. El spread solo se calcula cuando existen compra y venta.</p></div></article>
      <article class="panel"><div class="panel-head"><div class="panel-title"><span class="title-icon"><i class="fa-solid fa-building-columns"></i></span><div><h2>Mesa BCR y mercado profesional</h2><p>Dólar EE.UU. · PEN</p></div></div></div><div class="panel-body"><div class="table-wrap"><table><thead><tr><th>Mesa BCR</th><th>Prom. ponderado</th><th>Mínimo</th><th>Máximo</th></tr></thead><tbody id="negBcr"></tbody></table></div><p id="negBcrNote" class="neg-note"></p><div class="table-wrap"><table><thead><tr><th>Mercado profesional</th><th>Prom. ponderado</th></tr></thead><tbody id="negProfessional"></tbody></table></div></div></article>
    </div>`;

  function normalize(snapshot){
    const result=empty(date(snapshot.fecha_iso));
    for(const type of ['oferta_demanda','mesa_bcr','mercado_profesional']) result[type]=(snapshot[type]||[]).map(row=>({...row,moneda:name(row.moneda)}));
    // Legacy daily files may only expose the professional USD rate as tc_fix.
    if(!result.mercado_profesional.length && number(snapshot.tc_fix)!==null) result.mercado_profesional=[{moneda:'Dólar EE.UU.',promedio_ponderado:number(snapshot.tc_fix)}];
    return result;
  }
  async function load(){
    try{
      const oldLatest=state.latest, oldSelected=state.selected;
      const [latestResult,historyResult]=await Promise.allSettled([
        fetchJSON('./data/sbs_tc_promedio_latest.json',{fresh:true,cache:'no-store'}),
        fetchJSON('./data/sbs_tc_promedio_history.json',{fresh:true,cache:'no-store'})
      ]);
      const snapshots=new Map();
      let warning='';
      if(historyResult.status==='fulfilled' && Array.isArray(historyResult.value.observations)){
        for(const row of historyResult.value.observations){
          const key=date(row.fecha_iso);
          if(!key || !['oferta_demanda','mesa_bcr','mercado_profesional'].includes(row.tipo)) continue;
          if(!snapshots.has(key)) snapshots.set(key,empty(key));
          snapshots.get(key)[row.tipo].push({...row,moneda:name(row.moneda)});
        }
      }else warning='No se pudo actualizar el histórico de negociación.';
      if(latestResult.status==='fulfilled' && date(latestResult.value.fecha_iso)){
        const snapshot=normalize(latestResult.value);
        if(!snapshot.oferta_demanda.length && !snapshot.mercado_profesional.length) throw Error('Publicación de negociación vacía');
        snapshots.set(snapshot.fecha_iso,snapshot);
      }else warning+=' No se pudo consultar la última publicación; se muestra la última fecha del histórico disponible.';
      if(!snapshots.size) throw Error('No hay datos de negociación disponibles');
      // Keep already loaded history when only the latest endpoint is available.
      if(historyResult.status==='rejected') for(const [key,snapshot] of state.snapshots) if(!snapshots.has(key)) snapshots.set(key,snapshot);
      state.snapshots=snapshots;
      state.latest=dates().at(-1);
      state.selected=oldSelected && oldSelected!==oldLatest && snapshots.has(oldSelected)?oldSelected:state.latest;
      state.loaded=true; state.warning=warning.trim(); render(); return true;
    }catch(error){
      state.warning=state.loaded?'No se pudo actualizar. Se conservan los datos de la última carga.':'No se pudieron cargar los datos de negociación. Pulsa Actualizar para reintentar.';
      render(); showToast(state.warning,'warn'); return false;
    }
  }
  function rowsForSeries(){
    return dates().filter(d=>d<=state.selected).slice(-state.range).map(key=>{
      const snapshot=state.snapshots.get(key);
      const row=snapshot.oferta_demanda.find(r=>r.moneda===state.currency);
      const professional=snapshot.mercado_profesional.find(r=>r.moneda===state.currency);
      return {date:key,compra:number(row?.compra),venta:number(row?.venta),promedio:number(professional?.promedio_ponderado)};
    });
  }
  function renderChart(){
    if(root.hidden) return;
    const series=rowsForSeries(), colors=themeColors();
    el('negSeriesTable').innerHTML=series.slice().reverse().map(row=>`<tr><td>${displayDate(row.date)}</td><td class="num">${format(row.compra)}</td><td class="num">${format(row.venta)}</td><td class="num">${format(row.promedio)}</td></tr>`).join('')||'<tr><td colspan="4">Sin histórico disponible.</td></tr>';
    if(!window.echarts){el('negTrendChart').textContent='Gráfico no disponible. Consulta los valores de la serie debajo.';return;}
    if(!state.chart) state.chart=echarts.init(el('negTrendChart'));
    const specs=[['Compra','compra',colors.navy],['Venta','venta',colors.cyan],['Prom. ponderado','promedio',colors.avg]];
    state.chart.setOption({
      animationDuration:300,color:specs.map(s=>s[2]),
      legend:{top:0,textStyle:{color:colors.muted},data:specs.map(s=>s[0])},
      grid:{left:65,right:20,top:40,bottom:66},
      tooltip:{trigger:'axis',backgroundColor:colors.tooltipBg,borderColor:colors.tooltipBorder,textStyle:{color:'#fff'},formatter:items=>items.length?`${displayDate(items[0].axisValue)}<br>${items.map(item=>`${escape(item.seriesName)}: <b>${format(item.value)}</b>`).join('<br>')}`:''},
      xAxis:{type:'category',data:series.map(r=>r.date),boundaryGap:false,axisLabel:{color:colors.muted,formatter:v=>v.slice(5)},axisLine:{lineStyle:{color:colors.line}}},
      yAxis:{type:'value',scale:true,axisLabel:{color:colors.muted,formatter:v=>format(v)},splitLine:{lineStyle:{color:colors.grid}}},
      dataZoom:[{type:'inside'},{type:'slider',bottom:3,height:18,borderColor:colors.line,textStyle:{color:colors.muted}}],
      series:specs.map(([label,key,color])=>({name:label,type:'line',showSymbol:series.length<3,symbolSize:6,connectNulls:false,lineStyle:{width:2,color},data:series.map(row=>row[key])})),
      title:series.some(r=>[r.compra,r.venta,r.promedio].some(v=>v!==null))?[]:[{text:'Sin datos publicados en este rango',left:'center',top:'center',textStyle:{color:colors.muted,fontSize:12}}]
    },true);
    state.chart.resize();
  }
  function renderTable(){
    const q=el('negSearch').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const rows=current().oferta_demanda.filter(row=>row.moneda.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
    el('negRates').innerHTML=rows.map(row=>`<tr><td>${escape(row.moneda)}</td><td class="num">${format(row.compra)}</td><td class="num">${format(row.venta)}</td><td class="num">${format(spread(row))}</td></tr>`).join('')||'<tr><td colspan="4">Sin resultados.</td></tr>';
  }
  function render(){
    if(root.hidden) return;
    const snapshot=current(), usd=snapshot.oferta_demanda.find(row=>row.moneda==='Dólar EE.UU.');
    const professional=snapshot.mercado_profesional.find(row=>row.moneda==='Dólar EE.UU.');
    el('datePicker').value=state.selected;el('datePicker').min=dates()[0]||'';el('datePicker').max=state.latest;
    el('brandSubtitle').textContent=state.latest?`Fecha SBS: ${displayDate(state.latest)}`:'Fecha SBS: —';
    el('vFecha').textContent=state.selected===state.latest?'Última disponible':`Vista: ${displayDate(state.selected)}`;
    el('negMessage').textContent=state.warning||(!state.loaded?'Cargando negociación…':'');el('negMessage').hidden=!el('negMessage').textContent;
    for(const [id,value] of [['negBuy',usd?.compra],['negSell',usd?.venta],['negFix',professional?.promedio_ponderado],['negSpread',spread(usd)]]) el(id).textContent=format(value);
    const currencies=[...new Set([...state.snapshots.values()].flatMap(s=>[...s.oferta_demanda,...s.mercado_profesional].map(r=>r.moneda)))];
    currencies.sort((a,b)=>a==='Dólar EE.UU.'?-1:b==='Dólar EE.UU.'?1:a.localeCompare(b));
    if(!currencies.includes(state.currency)) state.currency=currencies[0]||'Dólar EE.UU.';
    el('negCurrency').innerHTML=currencies.map(c=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');el('negCurrency').value=state.currency;
    el('negHistoryLabel').textContent=state.loaded?`${state.currency} · Al ${displayDate(state.selected)} · Histórico desde ${displayDate(dates()[0])}`:'Histórico no disponible';
    renderTable();
    el('negBcr').innerHTML=snapshot.mesa_bcr.map(row=>`<tr><td>${escape(row.operacion)}</td><td class="num">${format(row.promedio_ponderado)}</td><td class="num">${format(row.minimo)}</td><td class="num">${format(row.maximo)}</td></tr>`).join('')||'<tr><td colspan="4">Sin datos publicados.</td></tr>';
    el('negBcrNote').textContent=snapshot.mesa_bcr.some(r=>[r.promedio_ponderado,r.minimo,r.maximo].some(v=>number(v)!==null))?'Cifras publicadas por la SBS para la fecha seleccionada.':'Sin valores publicados para la mesa BCR en esta fecha.';
    el('negProfessional').innerHTML=snapshot.mercado_profesional.map(row=>`<tr><td>${escape(row.moneda)}</td><td class="num">${format(row.promedio_ponderado)}</td></tr>`).join('')||'<tr><td colspan="2">Sin datos publicados.</td></tr>';
    renderChart();
  }
  function selectDate(key){
    if(!state.snapshots.has(key)){showToast('No hay publicación de negociación para esa fecha.','warn');render();return;}
    state.selected=key;render();
  }
  function shift(step){
    const keys=dates(),target=step>0?keys.find(key=>key>state.selected):keys.reverse().find(key=>key<state.selected);
    if(target) selectDate(target);else showToast('No hay otra fecha disponible en esa dirección.','warn');
  }
  function summary(){
    const snapshot=current();
    return [`TC Negociación SBS · ${state.selected||'—'}`, 'PEN por unidad de moneda',...snapshot.oferta_demanda.map(r=>`${r.moneda}: compra ${format(r.compra)} · venta ${format(r.venta)} · spread ${format(spread(r))}`),...snapshot.mercado_profesional.map(r=>`${r.moneda} · mercado profesional: ${format(r.promedio_ponderado)}`)].join('\n');
  }
  el('negCurrency').addEventListener('change',e=>{state.currency=e.target.value;render();});
  el('negSearch').addEventListener('input',renderTable);
  el('negRanges').addEventListener('click',e=>{const button=e.target.closest('[data-range]');if(!button)return;state.range=Number(button.dataset.range);el('negRanges').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));renderChart();});
  return {load,render,selectDate,shift,summary,today:()=>selectDate(state.latest),resize:()=>state.chart?.resize(),get loaded(){return state.loaded;}};
};

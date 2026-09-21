/* SBS average rates are a separate source; never substitute accounting rates. */
window.createNegotiationView = function({el, fetchJSON, fmt, displayDate, themeColors, showToast, rgba, chartDateLabel, chartTooltipDateLabel}) {
  const root=el('negotiationView');
  const state={snapshots:new Map(),latest:'',selected:'',pair:'USDPEN',range:30,chart:null,spreadChart:null,variation:'tc',loaded:false,warning:''};
  const name=value=>String(value||'').replace(/D[oó]lar de N\.A\./gi,'Dólar EE.UU.');
  const number=value=>value!==null && value!==undefined && value!=='' && Number.isFinite(Number(value))?Number(value):null;
  const format=value=>number(value)===null?'—':fmt(number(value),4);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value:'';
  const empty=key=>({fecha_iso:key,oferta_demanda:[],mesa_bcr:[],mercado_profesional:[]});
  const spread=row=>number(row?.compra)!==null && number(row?.venta)!==null?number(row.venta)-number(row.compra):null;
  const current=()=>state.snapshots.get(state.selected)||empty('');
  const dates=()=>[...state.snapshots.keys()].sort();
  const CURRENCIES={USD:'Dólar EE.UU.',EUR:'Euro',GBP:'Libra Esterlina',CAD:'Dólar Canadiense',CHF:'Franco Suizo',JPY:'Yen Japonés',MXN:'Peso Mexicano'};
  const QUICK=['USDPEN','EURPEN','EURUSD'];
  const card=(id,label,icon,accent,sub,tip)=>`<article class="kpi fx-card neg-card ${accent}" tabindex="0" data-tip="${tip}" aria-label="${label}" aria-describedby="negCardTooltip"><div class="kpi-inner"><div class="kpi-face kpi-front"><div class="kpi-top"><span><i class="fa-solid ${icon}"></i><span class="neg-label-long">${label}</span><span class="neg-label-short">${label.replace(/^USD(?: ·)? /,'')}</span></span><b id="${id}Delta" class="delta flat">—</b></div><strong id="${id}">—</strong><small>${sub}</small></div></div></article>`;
  root.innerHTML=`
    <div id="negMessage" class="neg-message" role="status" hidden></div>
    <div class="kpi-grid neg-kpis">
      ${card('negBuy','USD · COMPRA','fa-dollar-sign','','Dólar EE.UU. · PEN','Compra de Dólar EE.UU. en PEN')}
      ${card('negSell','USD · VENTA','fa-dollar-sign','accent','Dólar EE.UU. · PEN','Venta de Dólar EE.UU. en PEN')}
      ${card('negFix','USD FIX','fa-building-columns','purple','Dólar EE.UU. · PEN','Tipo de Cambio Interbancario')}
      ${card('negSpread','USD · SPREAD','fa-right-left','amber','Venta − compra · PEN','Diferencia entre venta y compra de Dólar EE.UU.')}
    </div>
    <div id="negCardTooltip" class="neg-card-tooltip" role="tooltip" hidden></div>
    <div class="chart-row neg-chart-row">
      <article class="panel"><div class="panel-head neg-trend-head"><div class="panel-title"><span class="title-icon"><i class="fa-solid fa-chart-line"></i></span><div><h2>Tendencia</h2><p id="negHistoryLabel">Cargando histórico…</p></div></div><div class="tools"><div id="negQuick" class="trend-quick neg-quick"></div><select id="negCurrency" aria-label="Otros pares de negociación"></select><select id="negCurrencyMobile" aria-label="Par de negociación"></select><div id="negRanges" class="tabs"><button class="tab" data-range="15">15D</button><button class="tab active" data-range="30">30D</button><button class="tab" data-range="60">60D</button><button class="tab" data-range="120">120D</button></div></div></div><div class="panel-body"><div id="negLegend" class="chart-legend"></div><div id="negTrendChart" class="chart"></div><p id="negSeriesNote" class="neg-note"></p><details id="negSeriesValues"><summary>Ver valores de la serie</summary><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Compra</th><th>Venta</th><th id="negAverageHead">Promedio</th><th>Spread</th></tr></thead><tbody id="negSeriesTable"></tbody></table></div></details></div></article>
      <article class="panel"><div class="panel-head neg-spread-head"><div class="panel-title"><span class="title-icon"><i class="fa-solid fa-chart-column"></i></span><div><h2>Spread y variación</h2><p id="negSpreadLabel">—</p></div></div><div id="negVariationTabs" class="tabs"><button class="tab active" data-variation="tc">Var. TC</button><button class="tab" data-variation="spread">Var. spread</button></div></div><div class="panel-body"><div id="negSpreadLegend" class="chart-legend"></div><div id="negSpreadChart" class="chart"></div><p id="negVariationNote" class="neg-note"></p></div></article>
    </div>
    <div class="neg-layout">
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
      state.loaded=true; state.warning=warning.trim(); render(); return !state.warning;
    }catch(error){
      state.warning=state.loaded?'No se pudo actualizar. Se conservan los datos de la última carga.':'No se pudieron cargar los datos de negociación. Pulsa Actualizar para reintentar.';
      render(); showToast(state.warning,'warn'); return false;
    }
  }
  const valid=value=>number(value)!==null && number(value)>0;
  const divide=(a,b)=>valid(a)&&valid(b)?number(a)/number(b):null;
  const change=(value,previous)=>number(value)!==null && valid(previous)?(number(value)/number(previous)-1)*100:null;
  function quote(snapshot,pair=state.pair){
    const base=pair.slice(0,3),term=pair.slice(3);
    const source=snapshot.oferta_demanda.find(r=>r.moneda===CURRENCIES[base]);
    const usd=snapshot.oferta_demanda.find(r=>r.moneda===CURRENCIES.USD);
    const compra=term==='PEN'?number(source?.compra):divide(source?.compra,usd?.venta);
    const venta=term==='PEN'?number(source?.venta):divide(source?.venta,usd?.compra);
    // Cross bid sells the base currency and buys USD; ask uses the opposite sides.
    const mid=compra!==null && venta!==null?(compra+venta)/2:null;
    const fix=snapshot.mercado_profesional.find(r=>r.moneda===CURRENCIES.USD);
    const promedio=pair==='USDPEN'?number(fix?.promedio_ponderado):mid;
    return {compra,venta,promedio,spread:spread({compra,venta})};
  }
  function rowsForSeries(){
    const keys=dates().filter(d=>d<=state.selected);
    return keys.map((key,index)=>{
      const row=quote(state.snapshots.get(key));
      const prev=index?quote(state.snapshots.get(keys[index-1])):null;
      return {date:key,...row,variation:change(row.promedio,prev?.promedio),spreadVariation:change(row.spread,prev?.spread)};
    }).slice(-state.range);
  }
  const averageLabel=()=>state.pair==='USDPEN'?'FIX':'Prom.';
  const signed=value=>number(value)===null?'—':`${value>=0?'+':''}${format(value)}%`;
  const pill=(label,value,color,suffix='')=>`<span class="legend-pill"><span class="legend-dot" style="background:${color}"></span>${label}<strong>${format(value)}${number(value)===null?'':suffix}</strong></span>`;
  const marker=color=>`<span aria-hidden="true" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:7px;vertical-align:middle"></span>`;
  function toolbox(colors,prefix){
    return {right:12,top:7,itemSize:14,itemGap:9,iconStyle:{borderColor:colors.muted},emphasis:{iconStyle:{borderColor:colors.ink}},feature:{dataZoom:{yAxisIndex:'none',title:{zoom:'Zoom',back:'Atrás'}},restore:{title:'Restaurar'},saveAsImage:{title:'Descargar',pixelRatio:3,backgroundColor:colors.panel,name:`${prefix}_${state.pair}_${state.selected}`}}};
  }
  function chartBase(rows,colors){
    return {
      animationDuration:540,grid:{left:10,right:14,top:48,bottom:66,containLabel:true},
      tooltip:{trigger:'axis',axisPointer:{type:'line'},backgroundColor:colors.tooltipBg,borderColor:colors.tooltipBorder,textStyle:{color:'#fff',fontWeight:500}},
      dataZoom:[{type:'inside',throttle:60},{type:'slider',height:22,bottom:18,borderColor:colors.line,fillerColor:rgba(colors.cyan,.2),handleStyle:{color:colors.navy},textStyle:{color:colors.muted,fontSize:10},backgroundColor:colors.soft}],
      xAxis:{type:'category',data:rows.map(r=>r.date),boundaryGap:false,axisLabel:{color:colors.muted,fontWeight:500,margin:13,formatter:chartDateLabel},axisLine:{lineStyle:{color:colors.line}},axisTick:{show:false}},
      yAxis:{type:'value',position:window.innerWidth<=760?'left':'right',scale:true,axisLabel:{color:colors.muted,fontSize:10,formatter:v=>format(v),hideOverlap:true},axisLine:{show:false},axisTick:{show:false},splitLine:{lineStyle:{color:colors.grid}}}
    };
  }
  function renderChart(){
    if(root.hidden) return;
    const rows=rowsForSeries(),colors=themeColors(),last=rows.at(-1)||{};
    const specs=[['Compra','compra','#1c7ff2'],['Venta','venta',colors.cyan],[averageLabel(),'promedio',colors.avg]];
    el('negLegend').innerHTML=specs.map(([label,key,color])=>pill(label,last[key],color)).join('')+pill('Spread',last.spread,colors.amber);
    el('negAverageHead').textContent=averageLabel();
    el('negSeriesTable').innerHTML=rows.slice().reverse().map(row=>`<tr><td>${displayDate(row.date)}</td><td class="num">${format(row.compra)}</td><td class="num">${format(row.venta)}</td><td class="num">${format(row.promedio)}</td><td class="num">${format(row.spread)}</td></tr>`).join('')||'<tr><td colspan="5">Sin histórico disponible.</td></tr>';
    el('negSeriesNote').textContent=state.pair==='USDPEN'?'PEN por USD · Promedio: FIX del mercado profesional publicado por SBS.':state.pair.endsWith('USD')?'USD por unidad · Compra: moneda/PEN compra ÷ USD/PEN venta. Venta: moneda/PEN venta ÷ USD/PEN compra. Promedio: (compra + venta) / 2.':'PEN por unidad · Promedio calculado: (compra + venta) / 2.';
    el('negSpreadLabel').textContent=`${state.pair} · Spread en ${state.pair.slice(3)} / Var. %`;
    const variationKey=state.variation==='spread'?'spreadVariation':'variation';
    const variationName=state.variation==='spread'?'Var. spread':'Var. TC';
    el('negSpreadLegend').innerHTML=pill('Spread',last.spread,colors.cyan)+pill(variationName,last[variationKey],colors.avg,'%');
    el('negVariationNote').textContent=`Spread = venta − compra (eje izquierdo). ${variationName}: cambio porcentual ${state.variation==='spread'?'del spread':state.pair==='USDPEN'?'del FIX':'del promedio'} frente a la publicación anterior (eje derecho).`;
    if(!window.echarts){for(const id of ['negTrendChart','negSpreadChart']) el(id).textContent='Gráfico no disponible. Consulta los valores de la serie.';return;}
    if(!state.chart) state.chart=echarts.init(el('negTrendChart'));
    if(!state.spreadChart) state.spreadChart=echarts.init(el('negSpreadChart'));
    const common=chartBase(rows,colors);
    state.chart.setOption({...common,toolbox:toolbox(colors,'Negociacion'),
      tooltip:{...common.tooltip,formatter:items=>{
        const row=rows.find(row=>row.date===items[0]?.axisValue);
        return row?`<b>${chartTooltipDateLabel(row.date)}</b><br>${specs.map(([label,key,color])=>`${marker(color)}${label}: <b>${format(row[key])}</b>`).join('<br>')}<br>${marker(colors.amber)}Spread: <b>${format(row.spread)}</b>`:'';
      }},
      series:specs.map(([label,key,color])=>({name:label,type:'line',showSymbol:rows.length<3,symbol:'circle',symbolSize:6,connectNulls:false,smooth:false,lineStyle:{width:2,color,opacity:1},itemStyle:{color,opacity:1},emphasis:{focus:'none',lineStyle:{width:2.5}},areaStyle:key==='promedio'?{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:rgba(color,.24)},{offset:.56,color:rgba(color,.10)},{offset:1,color:rgba(color,.015)}])}:undefined,data:rows.map(row=>row[key])})),
      title:rows.some(r=>[r.compra,r.venta,r.promedio].some(v=>v!==null))?[]:[{text:'Sin datos publicados en este rango',left:'center',top:'center',textStyle:{color:colors.muted,fontSize:12}}]
    },true);
    state.spreadChart.setOption({...common,toolbox:toolbox(colors,'Spread_variacion'),
      xAxis:{...common.xAxis,boundaryGap:true},
      tooltip:{...common.tooltip,formatter:items=>{const row=rows[items[0]?.dataIndex];return row?`<b>${chartTooltipDateLabel(row.date)}</b><br>${marker(colors.cyan)}Spread: <b>${format(row.spread)}</b><br>${marker(row[variationKey]>=0?colors.green:colors.red)}${variationName}: <b>${signed(row[variationKey])}</b>`:'';}},
      yAxis:[{...common.yAxis,position:'left',scale:true},{...common.yAxis,position:'right',scale:false,splitLine:{show:false},axisLabel:{...common.yAxis.axisLabel,formatter:v=>`${format(v)}%`}}],
      series:[{name:'Spread',type:'line',yAxisIndex:0,showSymbol:rows.length<3,connectNulls:false,lineStyle:{width:2.2,color:colors.cyan,opacity:1},itemStyle:{color:colors.cyan,opacity:1},emphasis:{focus:'none',lineStyle:{width:2.7}},data:rows.map(r=>r.spread),z:3},{name:variationName,type:'bar',yAxisIndex:1,barMaxWidth:15,emphasis:{focus:'none',itemStyle:{opacity:1}},data:rows.map(r=>({value:r[variationKey],itemStyle:{color:r[variationKey]>=0?colors.green:colors.red,opacity:1,borderRadius:r[variationKey]>=0?[3,3,0,0]:[0,0,3,3]}}))}],
      title:rows.some(r=>r.spread!==null||r[variationKey]!==null)?[]:[{text:'Sin datos suficientes',left:'center',top:'center',textStyle:{color:colors.muted,fontSize:12}}]
    },true);
    state.chart.resize();state.spreadChart.resize();
  }
  function renderPairControls(){
    const available=new Set([...state.snapshots.values()].flatMap(s=>s.oferta_demanda.map(r=>r.moneda)));
    const pairs=Object.keys(CURRENCIES).filter(code=>available.has(CURRENCIES[code])).flatMap(code=>code==='USD'?['USDPEN']:[`${code}PEN`,`${code}USD`]);
    if(!pairs.includes(state.pair)) state.pair=pairs[0]||'USDPEN';
    el('negQuick').innerHTML=QUICK.filter(p=>pairs.includes(p)).map(p=>`<button type="button" class="pair-btn ${state.pair===p?'active':''}" data-pair="${p}" aria-pressed="${state.pair===p}">${p}</button>`).join('');
    el('negCurrency').innerHTML='<option value="">Otros pares</option>'+pairs.filter(p=>!QUICK.includes(p)).map(p=>`<option value="${p}">${p}</option>`).join('');
    el('negCurrency').value=QUICK.includes(state.pair)?'':state.pair;
    el('negCurrencyMobile').innerHTML=pairs.map(p=>`<option value="${p}">${p}</option>`).join('');
    el('negCurrencyMobile').value=state.pair;
  }
  function renderTable(){
    const q=el('negSearch').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const rows=current().oferta_demanda.filter(row=>row.moneda.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
    el('negRates').innerHTML=rows.map(row=>`<tr><td>${escape(row.moneda)}</td><td class="num">${format(row.compra)}</td><td class="num">${format(row.venta)}</td><td class="num">${format(spread(row))}</td></tr>`).join('')||'<tr><td colspan="4">Sin resultados.</td></tr>';
  }
  function render(){
    if(root.hidden) return;
    renderPairControls();
    hideTooltip();
    const snapshot=current(), selectedQuote=quote(snapshot);
    const base=state.pair.slice(0,3),term=state.pair.slice(3),currency=CURRENCIES[base];
    el('datePicker').value=state.selected;el('datePicker').min=dates()[0]||'';el('datePicker').max=state.latest;
    el('brandSubtitle').textContent=state.latest?`Fecha SBS: ${displayDate(state.latest)}`:'Fecha SBS: —';
    el('vFecha').textContent=state.selected===state.latest?'Última disponible':`Vista: ${displayDate(state.selected)}`;
    el('negMessage').textContent=state.warning||(!state.loaded?'Cargando negociación…':'');el('negMessage').hidden=!el('negMessage').textContent;
    const prevKey=dates().filter(d=>d<state.selected).at(-1),previous=prevKey?quote(state.snapshots.get(prevKey)):{};
    const referenceLabel=state.pair==='USDPEN'?'FIX':'PROM.';
    for(const [id,key,label,tip] of [
      ['negBuy','compra','COMPRA',`Compra de ${currency} en ${term}`],
      ['negSell','venta','VENTA',`Venta de ${currency} en ${term}`],
      ['negFix','promedio',referenceLabel,state.pair==='USDPEN'?'Tipo de Cambio Interbancario · PEN por USD':`Promedio calculado: (compra + venta) / 2 · ${term} por ${base}`],
      ['negSpread','spread','SPREAD',`Diferencia venta − compra · ${term} por ${base}`]
    ]){
      const value=selectedQuote[key],prev=previous[key],card=el(id).closest('.neg-card');
      el(id).textContent=format(value);
      card.querySelector('.neg-label-long').textContent=`${base} · ${label}`;
      card.querySelector('.neg-label-short').textContent=label;
      card.querySelector('small').textContent=id==='negSpread'?`Venta − compra · ${term}`:`${currency} · ${term}`;
      card.dataset.tip=tip;
      card.setAttribute('aria-label',`${state.pair} · ${label}`);
      if(id==='negBuy'||id==='negSell') card.querySelector('.fa-solid').className=`fa-solid ${base==='USD'?'fa-dollar-sign':base==='EUR'?'fa-euro-sign':base==='GBP'?'fa-sterling-sign':base==='JPY'?'fa-yen-sign':'fa-coins'}`;
      const delta=change(value,prev),node=el(`${id}Delta`);node.textContent=signed(delta);node.className=`delta ${delta===null||delta===0?'flat':delta>0?'pos':'neg'}`;
    }
    el('negHistoryLabel').textContent=state.loaded?`${state.pair} · Histórico desde ${displayDate(dates()[0])}`:'Histórico no disponible';
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
  function hideTooltip(){el('negCardTooltip').hidden=true;}
  function showTooltip(card){
    const tip=el('negCardTooltip');tip.textContent=card.dataset.tip;tip.hidden=false;
    const box=card.getBoundingClientRect(),rect=tip.getBoundingClientRect();
    tip.style.left=`${Math.max(12,Math.min(box.left,window.innerWidth-rect.width-12))}px`;
    tip.style.top=`${Math.max(12,Math.min(box.bottom+8,window.innerHeight-rect.height-12))}px`;
  }
  root.querySelectorAll('.neg-card').forEach(card=>{
    card.addEventListener('pointerenter',()=>showTooltip(card));card.addEventListener('pointerleave',hideTooltip);
    card.addEventListener('focus',()=>showTooltip(card));card.addEventListener('blur',hideTooltip);
    card.addEventListener('click',()=>showTooltip(card));
    card.addEventListener('keydown',e=>{if(e.key==='Escape')hideTooltip();});
  });
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.neg-card'))hideTooltip();});
  document.addEventListener('scroll',hideTooltip,true);
  el('negCurrencyMobile').addEventListener('change',e=>{if(e.target.value){state.pair=e.target.value;render();}});
  el('negCurrency').addEventListener('change',e=>{if(e.target.value){state.pair=e.target.value;render();}});
  el('negQuick').addEventListener('click',e=>{const button=e.target.closest('[data-pair]');if(button){state.pair=button.dataset.pair;render();}});
  el('negVariationTabs').addEventListener('click',e=>{const button=e.target.closest('[data-variation]');if(!button)return;state.variation=button.dataset.variation;el('negVariationTabs').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));renderChart();});
  el('negSearch').addEventListener('input',renderTable);
  el('negRanges').addEventListener('click',e=>{const button=e.target.closest('[data-range]');if(!button)return;state.range=Number(button.dataset.range);el('negRanges').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));renderChart();});
  return {load,render,selectDate,shift,summary,hideTooltip,today:()=>selectDate(state.latest),resize:()=>{hideTooltip();state.chart?.resize();state.spreadChart?.resize();},get loaded(){return state.loaded;}};
};

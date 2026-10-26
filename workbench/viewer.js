/* Standalone browser viewer. Its only inputs are the embedded pack and optional synth API. */
(async () => {
  'use strict';
  const byId = id => document.getElementById(id);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const categoryNames = { char: '人物', character: '人物', astral: '伴星', portrait: '头像', prop: '物件', tile: '地形', ui: '界面', fx: '特效', effect: '特效', scene: '剧情画面' };
  try {
    const dataNode = byId('astra-workbench-data');
    if (!dataNode) throw new Error('展示包尚未生成。请使用构建后的 HTML。');
    const pack = JSON.parse(dataNode.textContent);
    if (pack.format !== 'astra.workbench/1' || pack.art?.manifest?.format !== 'astra.art/1' || !Array.isArray(pack.art.manifest.assets)) {
      throw new Error('展示包格式不正确。');
    }
    if (!pack.font?.data_url?.startsWith('data:font/woff2;base64,')) throw new Error('展示包缺少内嵌像素字体。');
    const font = new FontFace('Fusion', `url("${pack.font.data_url}")`);
    document.fonts.add(await font.load());

    const assets = pack.art.manifest.assets;
    const library = byId('library');
    const filter = byId('filter');
    const search = byId('search');
    const anchorToggle = byId('anchor-toggle');
    const animationToggle = byId('animate');
    const zoomSelect = byId('zoom');
    const cards = [];
    const visibleCards = new Set();
    const cardForNode = new Map();
    let playing = true;
    let zoom = Number(zoomSelect.value);
    let showAnchors = false;
    let lastTime = performance.now();
    let lastDraw = -Infinity;

    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        const card = cardForNode.get(entry.target);
        if (entry.isIntersecting) { visibleCards.add(card); card.dirty = true; }
        else visibleCards.delete(card);
      }
    }, { rootMargin: '64px' }) : null;

    function currentFrame(card) {
      if (card.manualFrame !== null) return card.manualFrame;
      const clip = card.asset.animations[card.animation.value];
      const step = Math.max(0, Math.floor(card.elapsed * clip.fps));
      return clip.frames[clip.loop ? step % clip.frames.length : Math.min(step, clip.frames.length - 1)];
    }
    function drawCard(card, force = false) {
      const frame = currentFrame(card);
      if (!force && !card.dirty && frame === card.drawnFrame) return;
      card.dirty = false; card.drawnFrame = frame;
      const { canvas, context, asset, image } = card;
      context.imageSmoothingEnabled = false;
      // Preview backdrop is diagnostic UI; the downloaded PNG remains byte-for-byte untouched.
      for (let y = 0; y < canvas.height; y += 8) {
        for (let x = 0; x < canvas.width; x += 8) {
          context.fillStyle = ((x / 8 + y / 8) % 2) ? '#d6c3ab' : '#b09a8a';
          context.fillRect(x, y, 8, 8);
        }
      }
      const x = Math.floor((canvas.width - asset.size[0]) / 2);
      const y = Math.floor((canvas.height - asset.size[1]) / 2);
      context.drawImage(image, frame * asset.size[0], 0, asset.size[0], asset.size[1], x, y, asset.size[0], asset.size[1]);
      if (showAnchors) {
        const ax = x + asset.anchor[0], ay = y + asset.anchor[1];
        context.fillStyle = '#1a1220';
        context.fillRect(ax - 4, ay - 1, 9, 3); context.fillRect(ax - 1, ay - 4, 3, 9);
        context.fillStyle = '#ffe36b';
        context.fillRect(ax - 3, ay, 7, 1); context.fillRect(ax, ay - 3, 1, 7);
      }
      canvas.dataset.frame = String(frame);
      card.frameInput.value = String(frame);
      const clip = asset.animations[card.animation.value];
      card.frameStatus.textContent = `图集帧 ${frame + 1} / ${asset.frames} · ${card.manualFrame !== null ? '手动' : `${clip.fps} fps · ${clip.loop ? '循环' : '单次'}`}`;
    }
    function setZoom(card) {
      card.canvas.style.width = `${card.canvas.width * zoom}px`;
      card.canvas.style.height = `${card.canvas.height * zoom}px`;
    }
    function updateFilter() {
      const query = search.value.trim().toLocaleLowerCase();
      let count = 0;
      for (const card of cards) {
        const match = (filter.value === 'all' || card.category === filter.value) && card.asset.id.toLocaleLowerCase().includes(query);
        card.article.hidden = !match;
        if (match) { count++; card.dirty = true; }
      }
      byId('result-count').textContent = `${count} / ${assets.length} 项`;
      byId('empty').hidden = count !== 0;
    }

    const categories = [...new Set(assets.map(asset => asset.category || asset.id.split('.')[0]))];
    for (const category of categories) filter.add(new Option(categoryNames[category] || category, category));
    for (const asset of assets) {
      const png = pack.art.pngs[asset.id];
      if (typeof png !== 'string' || !png.startsWith('data:image/png;base64,')) throw new Error(`素材未内嵌：${asset.id}`);
      const image = new Image(); image.src = png; await image.decode();
      if (image.naturalWidth !== asset.size[0] * asset.frames || image.naturalHeight !== asset.size[1]) throw new Error(`图集尺寸与清单不同：${asset.id}`);
      const category = asset.category || asset.id.split('.')[0];
      const article = make('article', 'asset-card'); article.dataset.id = asset.id; article.dataset.category = category;
      if(category==='scene')article.classList.add('asset-card-wide');
      const heading = make('h3', '', asset.id);
      const categoryLabel = make('p', 'category', categoryNames[category] || category);
      const preview = make('div', 'preview');
      const stage = make('div', 'preview-stage');
      const canvas = make('canvas');
      canvas.width = Math.max(80, asset.size[0] + 16); canvas.height = Math.max(80, asset.size[1] + 16);
      canvas.setAttribute('aria-label', `${asset.id} 像素预览`);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('此浏览器无法显示像素预览。');
      stage.append(canvas); preview.append(stage);
      const info = make('div', 'asset-info');
      info.append(make('span', '', `${asset.size[0]} × ${asset.size[1]} px`), make('span', '', `${asset.frames} 帧`), make('span', '', `锚点 ${asset.anchor.join(', ')}`));
      const hash = make('p', 'asset-hash', `SHA256 ${asset.hash.slice(0, 12)}…`); hash.title = asset.hash;
      const controls = make('div', 'animation-controls');
      const animation = make('select'); animation.dataset.animation = ''; animation.setAttribute('aria-label', `${asset.id} 动画`);
      for (const name of Object.keys(asset.animations)) animation.add(new Option(name, name));
      const replay = make('button', '', '重播'); replay.type = 'button'; replay.dataset.replay = ''; replay.setAttribute('aria-label', `重播 ${asset.id}`);
      controls.append(animation, replay);
      const frameStatus = make('p', 'frame-status');
      const frameControls = make('div', 'frame-controls');
      const frameInput = make('input'); frameInput.type = 'range'; frameInput.min = '0'; frameInput.max = String(asset.frames - 1); frameInput.step = '1'; frameInput.value = '0'; frameInput.dataset.frame = ''; frameInput.setAttribute('aria-label', `${asset.id} 图集帧`);
      const frameLabel = make('label', '', '逐帧'); frameLabel.append(frameInput);
      frameControls.append(frameLabel);
      const download = make('a', 'asset-download', '下载原始 PNG'); download.href = png; download.download = asset.file;
      article.append(heading, categoryLabel, preview, info, hash, controls, frameStatus, frameControls, download);
      library.append(article);
      const card = { article, category, asset, canvas, context, image, animation, frameInput, frameStatus, elapsed: 0, manualFrame: null, drawnFrame: -1, dirty: true };
      cards.push(card); cardForNode.set(article, card);
      setZoom(card); drawCard(card, true);
      if (observer) observer.observe(article); else visibleCards.add(card);
      const restart = () => { card.manualFrame = null; card.elapsed = 0; drawCard(card, true); };
      animation.addEventListener('change', restart); replay.addEventListener('click', restart);
      frameInput.addEventListener('input', () => { card.manualFrame = Number(frameInput.value); drawCard(card, true); });
    }
    filter.addEventListener('change', updateFilter); search.addEventListener('input', updateFilter);
    animationToggle.addEventListener('click', () => {
      playing = !playing; lastTime = performance.now();
      // Elapsed time advances every RAF, but painting is throttled to 30Hz. Flush
      // the already accumulated frame now so a queued paint cannot jump after pause.
      if (!playing) for (const card of visibleCards) if (!card.article.hidden) drawCard(card);
      animationToggle.textContent = playing ? '暂停动画' : '播放动画';
      animationToggle.setAttribute('aria-pressed', String(playing)); document.body.dataset.playing = String(playing);
    });
    zoomSelect.addEventListener('change', () => { zoom = Number(zoomSelect.value); for (const card of cards) setZoom(card); });
    anchorToggle.addEventListener('change', () => { showAnchors = anchorToggle.checked; for (const card of cards) { card.dirty = true; if (!card.article.hidden && visibleCards.has(card)) drawCard(card, true); } });
    updateFilter();
    const manifestLink = byId('manifest-download'); manifestLink.href = `data:application/json;charset=utf-8,${encodeURIComponent(pack.art.manifest_json)}`;
    byId('snapshot-meta').textContent = `${assets.length} 项图像 · ${assets.reduce((sum, asset) => sum + asset.frames, 0)} 帧 · ${(pack.audio?.cues || []).length} 段声音`;
    for (const color of pack.palette.colors) {
      const chip = make('div', 'chip'); const swatch = make('span', 'chip-swatch'); swatch.style.backgroundColor = color.hex;
      const label = make('div'); label.append(make('strong', '', color.name), make('small', '', color.hex)); chip.append(swatch, label); byId('palette').append(chip);
    }
    for (const license of pack.font.licenses || []) {
      const entry = make('section', 'license-entry'); entry.append(make('h3', '', license.name), make('pre', '', license.text)); byId('license-list').append(entry);
    }

    let audioContext = null;
    let audioMaster = null;
    let currentVoice = null;
    let requestSerial = 0;
    const buffers = new Map();
    const audioButtons = new Map();
    const audioStop = byId('audio-stop');
    const audioStatus = byId('audio-status');
    function stopVoice() {
      const previous = currentVoice; currentVoice = null;
      if (previous) { previous.stop(); previous.disconnect(); }
      for (const button of audioButtons.values()) button.setAttribute('aria-pressed', 'false');
      audioStop.disabled = true;
    }
    function stopAudio(message = '已停止试听') { requestSerial++; stopVoice(); audioStatus.textContent = message; }
    async function playCue(cue) {
      const serial = ++requestSerial;
      try {
        if (typeof AudioContext !== 'function' || typeof window.ASTRA_SYNTH?.renderCue !== 'function') throw new Error('当前浏览器无法播放合成声音。');
        if (!audioContext) {
          audioContext = new AudioContext(); audioMaster = audioContext.createGain(); audioMaster.gain.value = 0.8; audioMaster.connect(audioContext.destination);
        }
        await audioContext.resume();
        if (serial !== requestSerial || document.hidden) return;
        stopVoice();
        let buffer = buffers.get(cue.id);
        if (!buffer) {
          const sampleRate = cue.sampleRate || 44100;
          const samples = window.ASTRA_SYNTH.renderCue(cue.id, sampleRate);
          if (pack.audio.sample_format === 'pcm16') for (let index = 0; index < samples.length; index++) {
            const value = samples[index]; samples[index] = Math.round(value * (value < 0 ? 32768 : 32767)) / 32768;
          }
          buffer = audioContext.createBuffer(1, samples.length, sampleRate); buffer.getChannelData(0).set(samples); buffers.set(cue.id, buffer);
        }
        const source = audioContext.createBufferSource(); source.buffer = buffer; source.loop = cue.kind === 'music'; source.connect(audioMaster);
        currentVoice = source; audioStop.disabled = false; audioButtons.get(cue.id).setAttribute('aria-pressed', 'true');
        source.onended = () => {
          source.disconnect();
          if (currentVoice === source) { currentVoice = null; audioStop.disabled = true; audioButtons.get(cue.id).setAttribute('aria-pressed', 'false'); audioStatus.textContent = '试听结束'; }
        };
        source.start(); audioStatus.textContent = `正在试听：${cue.label || cue.id}${source.loop ? ' · 循环播放' : ''}`;
      } catch (error) { stopVoice(); audioStatus.textContent = error.message || '声音播放失败，请重试。'; }
    }
    for (const cue of pack.audio?.cues || []) {
      const button = make('button'); button.type = 'button'; button.dataset.cue = cue.id; button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', cue.label || cue.id);
      button.append(make('span', '', cue.label || cue.id), make('small', '', `${cue.kind === 'music' ? '乐曲' : '音效'} · ${cue.duration} s`));
      button.addEventListener('click', () => { void playCue(cue); }); byId('audio').append(button); audioButtons.set(cue.id, button);
    }
    audioStop.addEventListener('click', () => stopAudio());
    if (pack.audio?.source_sha256) { byId('audio-source').textContent = `合成源码 SHA256 ${pack.audio.source_sha256.slice(0, 12)}…`; byId('audio-source').title = pack.audio.source_sha256; }
    document.addEventListener('visibilitychange', () => {
      lastTime = performance.now();
      if (document.hidden && audioContext) { stopAudio('页面已隐藏，试听暂停'); void audioContext.suspend().catch(() => {}); }
    });
    window.addEventListener('pagehide', () => { stopAudio(); if (audioContext) void audioContext.close().catch(() => {}); });
    function animate(now) {
      const delta = Math.max(0, Math.min((now - lastTime) / 1000, 0.1)); lastTime = now;
      if (!document.hidden) {
        if (playing) for (const card of visibleCards) if (!card.article.hidden && card.manualFrame === null) card.elapsed += delta;
        if (now - lastDraw >= 1000 / 30) {
          lastDraw = now;
          for (const card of visibleCards) if (!card.article.hidden) drawCard(card);
        }
      }
      requestAnimationFrame(animate);
    }
    library.setAttribute('aria-busy', 'false');
    document.body.dataset.ready = 'true'; document.body.dataset.playing = 'true'; document.body.dataset.assetCount = String(assets.length);
    requestAnimationFrame(animate);
  } catch (error) {
    const fatal = byId('fatal'); fatal.hidden = false; fatal.textContent = error.message || '展示包无法打开。';
    byId('snapshot-meta').textContent = '素材未能载入'; byId('library').setAttribute('aria-busy', 'false');
    console.error(error);
  }
})();

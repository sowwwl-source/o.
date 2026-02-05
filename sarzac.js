(() => {
  const textureTargets = document.querySelectorAll('.texture-layer');
  if (!textureTargets.length) return;

  const morseWord = "-.. . .-.. - .- ";
  const glyph = " .......'>°v°<'....... ";
  const frequency = 4;

  function generateTexture(charLimit) {
    let texture = "";
    let counter = 0;
    while (texture.length < charLimit) {
      texture += morseWord;
      counter += 1;
      if (counter % frequency === 0) texture += glyph;
    }
    return texture;
  }

  textureTargets.forEach((el) => {
    el.innerText = generateTexture(1500);
  });

  const masterAudioFile = '/MASTER_TAPE.mp3';
  const totalSlices = 15;

  let audioCtx;
  let audioBuffer;
  let activeSource;
  let activeGain;
  let targetSpeed = 1.0;
  let currentSpeed = 1.0;

  const overlay = document.getElementById('start-overlay');
  const loadingMsg = document.getElementById('loading-msg');

  async function initSystem() {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      const response = await fetch(masterAudioFile);
      const arrayBuffer = await response.arrayBuffer();
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      if (loadingMsg) {
        loadingMsg.innerText = 'SYSTÈME DELTA ACTIF.';
        loadingMsg.style.color = '#00ff00';
        setTimeout(() => {
          loadingMsg.style.display = 'none';
        }, 2000);
      }

      if (
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function'
      ) {
        DeviceMotionEvent.requestPermission()
          .then((r) => {
            if (r === 'granted') window.addEventListener('devicemotion', handleMotion);
          })
          .catch(console.error);
      } else {
        window.addEventListener('devicemotion', handleMotion);
      }
    } catch (e) {
      if (loadingMsg) {
        loadingMsg.innerText = 'ERREUR: MASTER_TAPE.MP3 INTROUVABLE';
        loadingMsg.style.color = 'red';
      }
      console.error(e);
    }
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      initSystem();
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 1000);
    });
  }

  function playSlice(index) {
    if (!audioBuffer) return;
    stopSound();

    activeSource = audioCtx.createBufferSource();
    activeSource.buffer = audioBuffer;
    activeSource.playbackRate.value = currentSpeed;

    const sliceDuration = audioBuffer.duration / totalSlices;
    const startTime = index * sliceDuration;

    activeSource.loop = true;
    activeSource.loopStart = startTime;
    activeSource.loopEnd = startTime + sliceDuration;

    activeGain = audioCtx.createGain();
    activeGain.gain.value = 0;

    activeSource.connect(activeGain);
    activeGain.connect(audioCtx.destination);

    activeSource.start(0, startTime);
    activeGain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.1);
  }

  function stopSound() {
    if (activeSource && activeGain) {
      const now = audioCtx.currentTime;
      activeGain.gain.cancelScheduledValues(now);
      activeGain.gain.setValueAtTime(activeGain.gain.value, now);
      activeGain.gain.linearRampToValueAtTime(0, now + 0.2);

      const oldSource = activeSource;
      setTimeout(() => {
        oldSource.stop();
      }, 250);
      activeSource = null;
    }
  }

  function handleMotion(event) {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const movement = Math.abs(acc.x) + Math.abs(acc.y) + Math.abs(acc.z);
    const agitation = Math.abs(movement - 9.8);

    let newTarget = 1 / (1 + agitation * 0.2);

    if (newTarget > 1.0) newTarget = 1.0;
    if (newTarget < 0.15) newTarget = 0.15;

    targetSpeed = newTarget;
  }

  function animateLoop() {
    currentSpeed += (targetSpeed - currentSpeed) * 0.05;
    if (activeSource) {
      activeSource.playbackRate.value = currentSpeed;
    }
    requestAnimationFrame(animateLoop);
  }
  animateLoop();

  document.querySelectorAll('.card-container').forEach((card, index) => {
    card.addEventListener('mouseenter', () => playSlice(index));
    card.addEventListener('touchstart', () => playSlice(index), { passive: true });

    card.addEventListener('mouseleave', () => stopSound());
    card.addEventListener('touchend', () => stopSound());
  });

  const contribToggle = document.getElementById('contrib-toggle');
  const contribPanel = document.getElementById('contrib-panel');
  const recStart = document.getElementById('rec-start');
  const recStop = document.getElementById('rec-stop');
  const recUpload = document.getElementById('rec-upload');
  const recStatus = document.getElementById('rec-status');
  const recMsg = document.getElementById('rec-msg');
  const recPreview = document.getElementById('rec-preview');
  const archiveList = document.getElementById('archive-list');
  const recToken = document.getElementById('rec-token');

  if (!contribToggle || !contribPanel || !recStart || !recStop || !recUpload || !recStatus || !recMsg || !recPreview || !archiveList || !recToken) {
    return;
  }

  let mediaRecorder = null;
  let recChunks = [];
  let recBlob = null;

  const supportedMimes = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg'
  ];

  const recMime = window.MediaRecorder
    ? supportedMimes.find((t) => MediaRecorder.isTypeSupported(t)) || ''
    : '';

  function setRecStatus(text, color) {
    recStatus.textContent = text;
    if (color) recStatus.style.color = color;
  }

  function updateUploadEnabled() {
    recUpload.disabled = !(recBlob && recToken.value.trim());
  }

  function mimeToExt(mime) {
    if (!mime) return 'webm';
    if (mime.includes('audio/webm')) return 'webm';
    if (mime.includes('audio/ogg')) return 'ogg';
    if (mime.includes('audio/mpeg')) return 'mp3';
    if (mime.includes('audio/mp4')) return 'm4a';
    if (mime.includes('audio/wav')) return 'wav';
    if (mime.includes('audio/aac')) return 'aac';
    return 'webm';
  }

  async function startRecording() {
    recMsg.textContent = '';
    recPreview.style.display = 'none';
    recUpload.disabled = true;
    recBlob = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, recMime ? { mimeType: recMime } : undefined);
      recChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recBlob = new Blob(recChunks, { type: recMime || 'audio/webm' });
        recPreview.src = URL.createObjectURL(recBlob);
        recPreview.style.display = 'block';
        updateUploadEnabled();
        recStart.disabled = false;
        setRecStatus('PRÊT À ENVOYER', '#aaa');
      };

      mediaRecorder.start();
      recStart.disabled = true;
      recStop.disabled = false;
      setRecStatus('ENREGISTREMENT...', '#00ff00');
    } catch (err) {
      setRecStatus('ACCÈS MICRO REFUSÉ', '#ff3333');
      recStart.disabled = false;
      recStop.disabled = true;
    }
  }

  function stopRecording() {
    if (!mediaRecorder) return;
    recStop.disabled = true;
    setRecStatus('TRAITEMENT...', '#999');
    mediaRecorder.stop();
  }

  async function uploadRecording() {
    if (!recBlob) return;
    const token = recToken.value.trim();
    if (!token) {
      recMsg.textContent = 'CODE REQUIS';
      return;
    }
    recUpload.disabled = true;
    recMsg.textContent = 'ENVOI...';

    const form = new FormData();
    const ext = mimeToExt(recBlob.type);
    const filename = `trace_${Date.now()}.${ext}`;
    form.append('file', recBlob, filename);
    form.append('token', token);

    try {
      const res = await fetch('upload.php', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        const errMsg = data && data.error ? data.error : 'Upload failed';
        throw new Error(errMsg);
      }
      recMsg.textContent = 'TRACE AJOUTÉE';
      await loadArchive();
    } catch (err) {
      recMsg.textContent = 'ERREUR: ' + err.message;
      recUpload.disabled = false;
    }
  }

  async function loadArchive() {
    try {
      const res = await fetch(`list.php?ts=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      const items = data && data.items ? data.items : [];
      archiveList.innerHTML = '';
      if (!items.length) {
        archiveList.textContent = 'AUCUNE TRACE POUR L’INSTANT';
        return;
      }
      items.slice(0, 12).forEach((item) => {
        const wrap = document.createElement('div');
        wrap.className = 'contrib-item';
        const time = document.createElement('div');
        time.className = 'contrib-time';
        const dt = item.created ? new Date(item.created) : null;
        time.textContent = dt && !Number.isNaN(dt.getTime())
          ? dt.toLocaleString('fr-FR')
          : 'DATE INCONNUE';
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = item.file;
        wrap.appendChild(time);
        wrap.appendChild(audio);
        archiveList.appendChild(wrap);
      });
    } catch (err) {
      archiveList.textContent = 'ARCHIVE INDISPONIBLE';
    }
  }

  contribToggle.addEventListener('click', () => {
    const open = contribPanel.classList.toggle('open');
    contribPanel.setAttribute('aria-hidden', String(!open));
    if (open) loadArchive();
  });

  recStart.addEventListener('click', startRecording);
  recStop.addEventListener('click', stopRecording);
  recUpload.addEventListener('click', uploadRecording);
  recToken.addEventListener('input', updateUploadEnabled);

  if (!navigator.mediaDevices || !window.MediaRecorder) {
    recStart.disabled = true;
    setRecStatus('MICRO NON SUPPORTÉ', '#ff3333');
  } else {
    setRecStatus('PRÊT', '#666');
  }
})();

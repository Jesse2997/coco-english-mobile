const $ = id => document.getElementById(id);
let lessonData;
let topicKey = 'travel';
let level = 'A1';
let index = 0;
let voices = [];
let voiceChosenByUser = false;
let recorder;
let microphone;
let recordingEpoch = 0;
let recordingUrl;
let playback;

function setStatus(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function currentSteps() {
  return lessonData.topics[topicKey].levels[level];
}

function releaseRecording() {
  recordingEpoch++;
  if (playback) { playback.pause(); playback = undefined; }
  if (recordingUrl) { URL.revokeObjectURL(recordingUrl); recordingUrl = undefined; }
  $('replay').disabled = true;
}

function stopMicrophone() {
  microphone?.getTracks().forEach(track => track.stop());
  microphone = undefined;
}

function stopCurrentRecording() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  stopMicrophone();
  recorder = undefined;
  $('record').hidden = false;
  $('stop').hidden = true;
}

function render() {
  if (!lessonData) return;
  const steps = currentSteps();
  const step = steps[index];
  $('speaker').textContent = step.speaker === 'COCO' ? 'COCO' : '換你說';
  $('role').textContent = step.role;
  $('sentence').textContent = step.text;
  $('translation').textContent = step.zh;
  $('progress').textContent = `第 ${index + 1} / ${steps.length} 句`;
  $('progress-fill').style.width = `${(index + 1) / steps.length * 100}%`;
  $('previous').disabled = index === 0;
  $('next').disabled = index === steps.length - 1;
}

function changeLesson() {
  window.speechSynthesis?.cancel();
  stopCurrentRecording();
  releaseRecording();
  index = 0;
  topicKey = $('topic').value;
  level = $('level').value;
  render();
  setStatus('準備開始。先聽示範，再開口練習。');
}

function updateVoices() {
  if (!('speechSynthesis' in window)) {
    $('listen').disabled = true;
    setStatus('這台裝置沒有提供語音朗讀，仍可閱讀句子並錄音。', true);
    return;
  }
  const selected = $('voice').value;
  const available = speechSynthesis.getVoices();
  voices = available.filter(voice => /^en-US$/i.test(voice.lang));
  if (!voices.length) voices = available.filter(voice => /^en\b/i.test(voice.lang));
  $('voice').replaceChildren(new Option('裝置預設英文聲音', ''));
  for (const voice of voices) $('voice').add(new Option(voice.name, voice.voiceURI));
  if (voiceChosenByUser && voices.some(voice => voice.voiceURI === selected)) {
    $('voice').value = selected;
  } else if (!voiceChosenByUser) {
    const preferred = voices.find(voice => /^Samantha\b/i.test(voice.name))
      || voices.find(voice => /^Eddy\b/i.test(voice.name));
    $('voice').value = preferred?.voiceURI || '';
  }
}

function speak() {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const sentence = currentSteps()[index].text;
  const utterance = new SpeechSynthesisUtterance(sentence);
  utterance.lang = 'en-US';
  utterance.rate = 0.88;
  utterance.voice = voices.find(voice => voice.voiceURI === $('voice').value) || null;
  utterance.onstart = () => setStatus('正在示範朗讀。聽完後，按「開始跟讀錄音」。');
  utterance.onend = () => setStatus('示範播完了。現在換你開口說。');
  utterance.onerror = () => setStatus('這台裝置沒有播出示範聲音，請改選另一個聲音再試。', true);
  speechSynthesis.speak(utterance);
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus('這個瀏覽器無法錄音；請改用 iPhone 或 iPad 的 Safari 開啟安全連結。', true);
    return;
  }
  releaseRecording();
  const currentEpoch = recordingEpoch;
  const takeChunks = [];
  $('record').disabled = true;
  setStatus('正在請求麥克風。請在系統提示選擇「允許」。');
  try {
    microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    recorder = new MediaRecorder(microphone);
    const activeRecorder = recorder;
    activeRecorder.ondataavailable = event => { if (event.data?.size) takeChunks.push(event.data); };
    activeRecorder.onstop = () => {
      stopMicrophone();
      if (currentEpoch !== recordingEpoch) return;
      if (!takeChunks.length) { setStatus('這次沒有錄到聲音，請再試一次。', true); return; }
      const blob = new Blob(takeChunks, { type: activeRecorder.mimeType || takeChunks[0].type || 'audio/mp4' });
      recordingUrl = URL.createObjectURL(blob);
      $('replay').disabled = false;
      setStatus('錄音完成。按「回放我的錄音」聽聽看。');
    };
    activeRecorder.onerror = () => { stopMicrophone(); setStatus('錄音發生問題，請再試一次。', true); };
    activeRecorder.start();
    $('record').hidden = true;
    $('stop').hidden = false;
    setStatus('正在錄音。唸完後按「完成錄音」。');
  } catch (_) {
    stopMicrophone();
    setStatus('沒有取得麥克風。請檢查 Safari 的麥克風權限，再試一次。', true);
  } finally {
    $('record').disabled = false;
  }
}

async function replay() {
  if (!recordingUrl) return;
  if (playback) playback.pause();
  playback = new Audio(recordingUrl);
  playback.onended = () => setStatus('回放結束。可以再練這句，或按「下一句」。');
  playback.onerror = () => setStatus('這段錄音沒能播放，請重新錄音。', true);
  try { await playback.play(); setStatus('正在回放你的錄音。'); }
  catch (_) { setStatus('播放錄音失敗，請再按一次回放。', true); }
}

async function start() {
  try {
    if (window.COCO_LESSONS) {
      lessonData = window.COCO_LESSONS;
    } else {
      const response = await fetch('./lessons.json');
      if (!response.ok) throw new Error('課程資料無法載入');
      lessonData = await response.json();
    }
    for (const [key, topic] of Object.entries(lessonData.topics)) {
      $('topic').add(new Option(topic.name, key));
    }
    for (const stage of lessonData.levels) {
      $('level').add(new Option(`${stage} · ${lessonData.levelDescriptions[stage]}`, stage));
    }
    $('topic').value = topicKey;
    $('level').value = level;
    render();
    setStatus('準備開始。先聽示範，再開口練習。');
    updateVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', updateVoices);
  } catch (_) { setStatus('課程資料無法載入。請連上網路後重新開啟。', true); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

$('topic').addEventListener('change', changeLesson);
$('version-toggle').addEventListener('click', () => {
  const panel = $('version-panel');
  panel.hidden = !panel.hidden;
  $('version-toggle').setAttribute('aria-expanded', String(!panel.hidden));
});
$('reload-page').addEventListener('click', () => location.reload());
$('level').addEventListener('change', changeLesson);
$('voice').addEventListener('change', () => { voiceChosenByUser = true; });
$('listen').addEventListener('click', speak);
$('record').addEventListener('click', startRecording);
$('stop').addEventListener('click', stopCurrentRecording);
$('replay').addEventListener('click', replay);
$('previous').addEventListener('click', () => { if (index > 0) { stopCurrentRecording(); releaseRecording(); index--; render(); setStatus('已切換到上一句。'); } });
$('next').addEventListener('click', () => { if (index < currentSteps().length - 1) { stopCurrentRecording(); releaseRecording(); index++; render(); setStatus('已切換到下一句。'); } });
window.addEventListener('pagehide', () => { window.speechSynthesis?.cancel(); stopCurrentRecording(); releaseRecording(); });
start();

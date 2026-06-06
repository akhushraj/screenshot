'use strict';

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'capture-stream') {
    captureFrame(message.streamId);
  }
});

async function captureFrame(streamId) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
          maxWidth: screen.width * window.devicePixelRatio,
          maxHeight: screen.height * window.devicePixelRatio,
        },
      },
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;

    await new Promise(resolve => { video.onloadedmetadata = resolve; });
    await video.play();

    // Give the video renderer a moment to produce a real frame
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => setTimeout(resolve, 120));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.slice('data:image/png;base64,'.length);

    chrome.runtime.sendMessage({ type: 'capture-complete', base64 });
  } catch (err) {
    console.error('[Captura] offscreen capture failed:', err);
  } finally {
    stream?.getTracks().forEach(t => t.stop());
  }
}

/**
 * LipSyncEngine for Money In Minutes
 * 
 * Computes audio-aligned viseme mouth morphing, eye blinks, eyebrow emphasis,
 * and natural head bobs from narration timestamps.
 */

const VISEMES = {
  REST: 'rest',                     // Closed lips, neutral / pause
  OPEN_WIDE: 'open_wide',           // Vowels: AH, AA, AE (e.g. "Costco", "Profit")
  OPEN_ROUND: 'open_round',         // Vowels: OH, OO, W (e.g. "Most", "You")
  TEETH_FRICATIVE: 'teeth_fricative', // Consonants: S, T, D, N, Z, TH (e.g. "From", "Fee")
  SMILE_SPEAKING: 'smile_speaking'   // Vowels: EE, I, Y (e.g. "Fee", "In", "Minutes")
};

class LipSyncEngine {
  constructor() {
    this.visemes = VISEMES;
  }

  /**
   * Map word text to a sequence of viseme phoneme estimates
   */
  classifyWordVisemes(word) {
    const clean = String(word || '').toLowerCase().replace(/[^a-z0-9$]/g, '');
    if (!clean) return [VISEMES.REST];

    const visemeSeq = [];
    for (let i = 0; i < clean.length; i++) {
      const char = clean[i];
      if ('ae'.includes(char)) {
        visemeSeq.push(VISEMES.OPEN_WIDE);
      } else if ('ou'.includes(char) || char === 'w') {
        visemeSeq.push(VISEMES.OPEN_ROUND);
      } else if ('iy'.includes(char)) {
        visemeSeq.push(VISEMES.SMILE_SPEAKING);
      } else if ('stcdfgjkmnprvxz'.includes(char) || char === '$') {
        visemeSeq.push(VISEMES.TEETH_FRICATIVE);
      }
    }

    return visemeSeq.length > 0 ? visemeSeq : [VISEMES.OPEN_WIDE];
  }

  /**
   * Generate continuous viseme keyframes given word timings
   * @param {Array<{word: string, start: number, end: number}>} wordTimings
   * @param {number} totalDurationSec
   * @param {number} fps - target frame rate (e.g. 15 or 30 fps)
   */
  generateKeyframes(wordTimings = [], totalDurationSec = 50, fps = 15) {
    const totalFrames = Math.max(1, Math.round(totalDurationSec * fps));
    const frames = [];

    let currentWordIdx = 0;
    const sortedWords = [...wordTimings].sort((a, b) => (a.start || 0) - (b.start || 0));

    for (let f = 0; f < totalFrames; f++) {
      const timeSec = f / fps;

      // Find active word
      while (
        currentWordIdx < sortedWords.length - 1 &&
        (sortedWords[currentWordIdx].end || 0) < timeSec
      ) {
        currentWordIdx++;
      }

      const activeWord = sortedWords[currentWordIdx];
      const isSpeaking = activeWord && timeSec >= (activeWord.start || 0) && timeSec <= (activeWord.end || 0);

      let viseme = VISEMES.REST;
      let mouthOpenness = 0;

      if (isSpeaking) {
        const wordProgress = (timeSec - activeWord.start) / Math.max(0.05, (activeWord.end - activeWord.start));
        const visemeList = this.classifyWordVisemes(activeWord.word);
        const seqIdx = Math.min(visemeList.length - 1, Math.floor(wordProgress * visemeList.length));
        viseme = visemeList[seqIdx] || VISEMES.OPEN_WIDE;

        // Smooth mouth cycle
        mouthOpenness = 0.4 + 0.6 * Math.sin(wordProgress * Math.PI * (visemeList.length || 2));
      }

      // Procedural natural eye blinks (every ~3.5 seconds for ~0.15s)
      const blinkCycle = (timeSec % 3.5);
      const isBlinking = blinkCycle >= 0 && blinkCycle <= 0.16;

      // Procedural gentle head bob during speech
      const headBobY = isSpeaking ? Math.sin(timeSec * 8) * 4 : Math.sin(timeSec * 1.5) * 1.5;
      const headTiltDeg = isSpeaking ? Math.sin(timeSec * 4) * 2.5 : 0;

      // Eyebrow emphasis
      const isEmphasized = isSpeaking && (activeWord.word.length > 6 || /[$0-9%!]/.test(activeWord.word));
      const eyebrowRaise = isEmphasized ? 8 : (isSpeaking ? 3 : 0);

      frames.push({
        frame: f,
        timeSec: Number(timeSec.toFixed(3)),
        viseme,
        mouthOpenness: Number(mouthOpenness.toFixed(2)),
        isBlinking,
        headBobY: Number(headBobY.toFixed(1)),
        headTiltDeg: Number(headTiltDeg.toFixed(1)),
        eyebrowRaise: Number(eyebrowRaise.toFixed(1)),
        isSpeaking
      });
    }

    return frames;
  }

  /**
   * Render SVG mouth path according to viseme state & openness
   */
  renderVisemeMouthSVG(viseme, openness = 0.5, emotion = 'neutral') {
    const open = Math.max(0.1, Math.min(1.0, openness));
    const height = Math.round(14 * open);

    switch (viseme) {
      case VISEMES.OPEN_WIDE:
        return `
          <g class="viseme-mouth viseme-open-wide">
            <ellipse cx="0" cy="${4 + height / 2}" rx="16" ry="${height}" fill="#2B0000" stroke="#E65C5C" stroke-width="2"/>
            <path d="M -10 ${4} Q 0 ${6} 10 ${4}" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round"/>
            <ellipse cx="0" cy="${4 + height - 3}" rx="9" ry="5" fill="#FF5252"/>
          </g>
        `;

      case VISEMES.OPEN_ROUND:
        return `
          <g class="viseme-mouth viseme-open-round">
            <ellipse cx="0" cy="${6 + height / 2}" rx="${10 * (1.2 - open * 0.2)}" ry="${height + 2}" fill="#2B0000" stroke="#E65C5C" stroke-width="2"/>
            <ellipse cx="0" cy="${6 + height}" rx="6" ry="4" fill="#FF5252"/>
          </g>
        `;

      case VISEMES.TEETH_FRICATIVE:
        return `
          <g class="viseme-mouth viseme-teeth">
            <path d="M -16 6 Q 0 14 16 6 Q 0 2 0 2 Z" fill="#2B0000" stroke="#E65C5C" stroke-width="2"/>
            <path d="M -12 6 Q 0 8 12 6" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-linecap="round"/>
          </g>
        `;

      case VISEMES.SMILE_SPEAKING:
        return `
          <g class="viseme-mouth viseme-smile-speaking">
            <path d="M -18 3 Q 0 ${12 + height} 18 3 Q 0 0 -18 3 Z" fill="#2B0000" stroke="#E65C5C" stroke-width="2"/>
            <path d="M -14 4 Q 0 7 14 4" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round"/>
            <ellipse cx="0" cy="${5 + height * 0.7}" rx="8" ry="4" fill="#FF5252"/>
          </g>
        `;

      case VISEMES.REST:
      default:
        if (emotion === 'happy' || emotion === 'celebrating') {
          return `
            <g class="viseme-mouth viseme-rest">
              <path d="M -14 4 Q 0 12 14 4" stroke="#7A3B2E" stroke-width="3.5" fill="none" stroke-linecap="round"/>
            </g>
          `;
        }
        if (emotion === 'shocked' || emotion === 'surprised') {
          return `
            <g class="viseme-mouth viseme-rest">
              <ellipse cx="0" cy="8" rx="8" ry="10" fill="#2B0000" stroke="#7A3B2E" stroke-width="2"/>
            </g>
          `;
        }
        return `
          <g class="viseme-mouth viseme-rest">
            <path d="M -12 6 Q 0 8 12 6" stroke="#7A3B2E" stroke-width="3" fill="none" stroke-linecap="round"/>
          </g>
        `;
    }
  }
}

module.exports = { LipSyncEngine, VISEMES };

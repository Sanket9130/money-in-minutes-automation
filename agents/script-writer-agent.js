const { Logger } = require('../utils/logger');
const { AITextService } = require('../utils/ai-text-service');

class ScriptWriterAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('ScriptWriter');
    this.templates = this.loadTemplates();
    this.aiTextService = new AITextService(credentials?.credentials || credentials || {});
  }

  async initialize() {
    this.logger.info('Initializing Script Writer Agent...');
    return true;
  }

  loadTemplates() {
    return {
      tutorial: {
        structure: ['hook', 'introduction', 'problem', 'solution_steps', 'demonstration', 'recap', 'cta'],
        tone: 'educational',
        pacing: 'moderate'
      },
      explainer: {
        structure: ['hook', 'question', 'background', 'explanation', 'examples', 'implications', 'summary', 'cta'],
        tone: 'informative',
        pacing: 'steady'
      },
      list: {
        structure: ['hook', 'introduction', 'list_items', 'bonus_item', 'summary', 'cta'],
        tone: 'engaging',
        pacing: 'quick'
      },
      review: {
        structure: ['hook', 'introduction', 'overview', 'pros', 'cons', 'comparison', 'verdict', 'cta'],
        tone: 'analytical',
        pacing: 'detailed'
      },
      story: {
        structure: ['hook', 'setup', 'conflict', 'journey', 'climax', 'resolution', 'lesson', 'cta'],
        tone: 'narrative',
        pacing: 'dynamic'
      }
    };
  }

  extractApplicableContentDNA(strategy = {}) {
    const dna = strategy?.contentDNA;
    if (!dna || typeof dna !== 'object') return null;

    // 0 samples or 1-2 samples: no DNA influence
    const sampleCount = Number(dna.sampleCount ?? 0);
    if (sampleCount < 3) return null;

    // Confidence check: must be medium or high
    const rawLevel = typeof dna.confidence === 'object'
      ? dna.confidence?.level
      : dna.confidence;
    const confidence = String(rawLevel || '').toLowerCase();
    if (!['medium', 'high'].includes(confidence)) return null;

    const dominantHook = dna.dominantHookPatterns || dna.hookPattern;
    const dominantPacing = dna.dominantPacingPatterns || dna.pacingPattern;
    const dominantVisual = dna.dominantVisualPatterns || dna.visualDensityPattern;

    if (!dominantHook && !dominantPacing) return null;

    const hookTypes = ['question', 'statistic', 'statement', 'challenge', 'promise'];
    let preferredHookType = dominantHook?.preferredType || dominantHook?.hookType || null;
    if (preferredHookType && !hookTypes.includes(preferredHookType.toLowerCase())) {
      preferredHookType = null;
    }

    const preferredHookLength = dominantHook?.preferredLength || dominantHook?.pacingStyle || null;
    const averageHookDuration = Number.isFinite(dominantHook?.averageHookDuration)
      ? dominantHook.averageHookDuration
      : dominantHook?.hookDurationSeconds || null;
    const averageHookWordCount = Number.isFinite(dominantHook?.averageHookWordCount)
      ? dominantHook.averageHookWordCount
      : dominantHook?.hookWordCount || null;

    const preferredPacing = dominantPacing?.preferredPacing || dominantPacing?.pacing || null;
    const averageSceneDuration = Number.isFinite(dominantPacing?.averageSceneDuration)
      ? dominantPacing.averageSceneDuration
      : null;
    const averageSceneCount = Number.isFinite(dominantPacing?.averageSceneCount)
      ? dominantPacing.averageSceneCount
      : dominantPacing?.sceneCount || null;

    const preferredDensityLevel = dominantVisual?.preferredDensityLevel || dominantVisual?.densityLevel || null;

    return {
      confidence,
      sampleCount,
      preferredHookType,
      preferredHookLength,
      averageHookDuration,
      averageHookWordCount,
      preferredPacing,
      averageSceneDuration,
      averageSceneCount,
      preferredDensityLevel
    };
  }

  getDNANonApplicationReason(strategy = {}) {
    const dna = strategy?.contentDNA;
    if (!dna) return 'no_dna_profile';
    if (typeof dna !== 'object') return 'malformed_dna';
    const sampleCount = Number(dna.sampleCount ?? 0);
    if (sampleCount < 3) return 'insufficient_samples';
    const rawLevel = typeof dna.confidence === 'object' ? dna.confidence?.level : dna.confidence;
    const confidence = String(rawLevel || '').toLowerCase();
    if (!['medium', 'high'].includes(confidence)) return 'low_confidence';
    return 'not_applicable';
  }

  buildDNAGuidancePrompt(appliedDNA) {
    if (!appliedDNA) return '';

    const isHighConfidence = appliedDNA.confidence === 'high';
    const guidelines = [];

    if (appliedDNA.preferredHookType) {
      const verb = isHighConfidence ? 'strongly favor' : 'consider';
      let hookDesc = `${verb} an engaging ${appliedDNA.preferredHookType} hook`;
      if (appliedDNA.preferredHookLength === 'concise' || (appliedDNA.averageHookWordCount && appliedDNA.averageHookWordCount <= 40)) {
        hookDesc += ' (concise, under 15-20 words)';
      } else if (appliedDNA.preferredHookLength === 'extended') {
        hookDesc += ' (context-rich)';
      }
      guidelines.push(`- Hook guideline: ${hookDesc}.`);
    }

    if (appliedDNA.preferredPacing || appliedDNA.averageSceneDuration) {
      const pacingStyle = appliedDNA.preferredPacing || 'moderate';
      const sceneDur = appliedDNA.averageSceneDuration
        ? ` (~${Math.round(appliedDNA.averageSceneDuration)}s per scene)`
        : '';
      guidelines.push(`- Rhythm & pacing guideline: ${pacingStyle} pacing${sceneDur}.`);
    }

    if (appliedDNA.preferredDensityLevel && appliedDNA.preferredDensityLevel !== 'unknown') {
      guidelines.push(`- Visual structure guideline: structure sections to support ${appliedDNA.preferredDensityLevel} visual density.`);
    }

    if (!guidelines.length) return '';

    return `\nLearned Content DNA creative/structural guidelines (apply as stylistic/structural guidance only; NEVER use as factual claims, data, or evidence):
${guidelines.join('\n')}\n`;
  }

  async generateScript(strategy) {
    try {
      this.logger.info(`Generating script for: ${strategy.topic}`);
      
      const appliedDNA = this.extractApplicableContentDNA(strategy);
      const template = this.templates[strategy.contentType.toLowerCase()] || this.templates.explainer;
      const aiScript = await this.generateScriptWithAI(strategy, template, appliedDNA);
      if (aiScript) {
        aiScript.fullScript = this.formatFullScript(aiScript);
        aiScript.metadata = aiScript.metadata || {};
        aiScript.metadata.appliedDNA = appliedDNA
          ? {
              applied: true,
              confidence: appliedDNA.confidence,
              sampleCount: appliedDNA.sampleCount,
              guidelines: {
                hookType: appliedDNA.preferredHookType || null,
                hookLength: appliedDNA.preferredHookLength || null,
                pacing: appliedDNA.preferredPacing || null,
                sceneDuration: appliedDNA.averageSceneDuration || null
              },
              isFactualVerification: false
            }
          : {
              applied: false,
              reason: this.getDNANonApplicationReason(strategy),
              isFactualVerification: false
            };
        await this.db.saveScript(aiScript);
        this.logger.info(`Script generated with AI provider: ${aiScript.title}`);
        return aiScript;
      }
      
      this.logger.info('Using template script generation');
      // Generate script components
      const hook = await this.generateHook(strategy, appliedDNA);
      const introduction = await this.generateIntroduction(strategy);
      const mainContent = await this.generateMainContent(strategy, template);
      const conclusion = await this.generateConclusion(strategy);
      const cta = await this.generateCTA(strategy);

      // Assemble complete script
      const script = {
        title: await this.generateTitle(strategy),
        hook,
        introduction,
        mainContent,
        conclusion,
        callToAction: cta,
        duration: this.estimateDuration(mainContent),
        tone: template.tone,
        pacing: appliedDNA?.preferredPacing || template.pacing,
        keywords: strategy.keywords || [],
        claims: [],
        metadata: {
          strategy: strategy,
          generatedAt: new Date().toISOString(),
          version: '1.0',
          appliedDNA: appliedDNA
            ? {
                applied: true,
                confidence: appliedDNA.confidence,
                sampleCount: appliedDNA.sampleCount,
                guidelines: {
                  hookType: appliedDNA.preferredHookType || null,
                  hookLength: appliedDNA.preferredHookLength || null,
                  pacing: appliedDNA.preferredPacing || null,
                  sceneDuration: appliedDNA.averageSceneDuration || null
                },
                isFactualVerification: false
              }
            : {
                applied: false,
                reason: this.getDNANonApplicationReason(strategy),
                isFactualVerification: false
              }
        }
      };

      // Format for readability
      script.fullScript = this.formatFullScript(script);
      
      // Save to database
      await this.db.saveScript(script);
      
      this.logger.info(`Script generated: ${script.title}`);
      return script;
    } catch (error) {
      this.logger.error('Failed to generate script:', error);
      throw error;
    }
  }

  validateShortsHook(hookInput) {
    const text = typeof hookInput === 'object' && hookInput !== null
      ? (hookInput.text || '')
      : String(hookInput || '');
    const cleanText = text.trim();

    if (!cleanText) {
      this.logger?.warn?.('Shorts hook validation: Hook text is empty');
      return { isValid: false, reason: 'EMPTY_HOOK' };
    }

    const genericIntros = [
      /^have you ever wondered/i,
      /^did you know/i,
      /^[a-z0-9\s]+ is about to change everything/i,
      /^in this video/i,
      /^today we are/i,
      /^welcome back/i
    ];

    const isGenericIntro = genericIntros.some(pattern => pattern.test(cleanText));
    const hasDollar = /\$\s*\d+/i.test(cleanText);
    const hasPercent = /\d+\s*%/i.test(cleanText);
    const hasNumber = /\b\d+[\d,.]*\b/.test(cleanText);
    const hasSpecificTrigger = /(waste|drain|cost|lose|secret|trap|mistake|hidden|stop|paying|audit|refund|save|perceive|actual)/i.test(cleanText);

    const hasSpecificity = hasDollar || hasPercent || (hasNumber && hasSpecificTrigger) || (cleanText.length <= 120 && hasSpecificTrigger);

    if (isGenericIntro || !hasSpecificity) {
      this.logger?.warn?.(`Shorts hook lacks concrete curiosity/stakes: "${cleanText.slice(0, 60)}..."`);
      return {
        isValid: false,
        reason: isGenericIntro ? 'GENERIC_INTRO' : 'LACKS_SPECIFICITY',
        suggestion: 'Include a specific dollar amount, percentage, or concrete relatable mistake in the first 3 seconds.'
      };
    }

    return { isValid: true };
  }

  buildShortsSceneList(shortsScript, options = {}) {
    if (!shortsScript) return [];

    // Support 10-14 granular visual beats for premium Shorts
    if (Array.isArray(shortsScript.beats) && shortsScript.beats.length > 0) {
      const scenes = shortsScript.beats.map((beat, idx) => ({
        id: beat.id || `beat_${idx + 1}`,
        beat: beat.beat || beat.id || `beat_${idx + 1}`,
        sceneType: beat.sceneType || (beat.isPresenter ? 'presenter' : 'broll'),
        label: beat.label || `Scene ${idx + 1}`,
        scriptText: beat.scriptText || beat.text || '',
        duration: Math.max(1.5, Number(beat.duration || beat.durationSeconds || 3)),
        isPresenter: Boolean(beat.isPresenter),
        character: beat.character || shortsScript.character || null,
        assetPath: beat.assetPath || null,
        brollKeywords: beat.brollKeywords || beat.keywords || [],
        verifiedData: beat.verifiedData || null,
        treatment: beat.treatment || null,
        motion: beat.motion || null,
        isHook: idx === 0 || Boolean(beat.isHook),
        isCTA: idx === shortsScript.beats.length - 1 || Boolean(beat.isCTA)
      }));

      // Scale durations to totalDuration if provided
      if (options.totalDuration && options.totalDuration > 0 && scenes.length > 0) {
        const currentSum = scenes.reduce((sum, s) => sum + s.duration, 0);
        if (currentSum > 0) {
          const ratio = options.totalDuration / currentSum;
          scenes.forEach(s => {
            s.duration = Math.max(1.5, Number((s.duration * ratio).toFixed(2)));
          });
        }
      }
      return scenes;
    }

    const scenes = [];
    const hookObj = shortsScript.hook;
    const hookText = typeof hookObj === 'object' ? (hookObj.text || hookObj.scriptText || '') : String(hookObj || '');

    if (hookText) {
      scenes.push({
        id: 'hook',
        beat: 'hook',
        sceneType: 'hook',
        label: 'Must Watch',
        scriptText: hookText,
        duration: Math.max(3, parseInt(hookObj?.durationSeconds || hookObj?.duration, 10) || 4),
        isHook: true
      });
    }

    const storyBeats = [
      { key: 'curiosityGap', label: 'The Hidden Truth', defaultDur: 5, id: 'curiosity_gap' },
      { key: 'dataReveal', label: 'Key Data', defaultDur: 7, id: 'data_reveal' },
      { key: 'escalation', label: 'The Real Cost', defaultDur: 7, id: 'escalation' },
      { key: 'payoff', label: '10-Year Impact', defaultDur: 7, id: 'payoff' }
    ];

    let hasStoryBeats = false;
    for (const beat of storyBeats) {
      const beatVal = shortsScript[beat.key] || shortsScript.shortsStory?.[beat.key];
      if (beatVal) {
        hasStoryBeats = true;
        let scriptText = '';
        let verifiedData = null;

        if (typeof beatVal === 'string') {
          scriptText = beatVal;
        } else if (Array.isArray(beatVal)) {
          scriptText = beatVal.filter(l => typeof l === 'string').join(' ');
        } else if (typeof beatVal === 'object') {
          scriptText = beatVal.text || beatVal.scriptText || beatVal.content || '';
          if (beatVal.verifiedData) {
            verifiedData = beatVal.verifiedData;
          } else if (beatVal.metric) {
            verifiedData = {
              verified: true,
              type: 'statistic',
              value: beatVal.metric,
              label: beat.label,
              source: beatVal.source || 'Verified Financial Data'
            };
          } else if (beatVal.comparison) {
            const leftVal = beatVal.comparison.perceived || beatVal.comparison.left || '$86 / MO';
            const rightVal = beatVal.comparison.actual || beatVal.comparison.right || '$219 / MO';
            verifiedData = {
              verified: true,
              type: 'comparison',
              left: { label: 'ESTIMATED', value: leftVal },
              right: { label: 'ACTUAL', value: rightVal },
              label: beat.label,
              source: beatVal.source || beatVal.comparison.source || 'Verified Financial Data'
            };
          } else if (beatVal.takeaway) {
            const match = String(beatVal.takeaway).match(/\$[\d,]+(?:\.\d+)?(?:[kKmMbB]|(?:\/mo))?/);
            verifiedData = {
              verified: true,
              type: 'statistic',
              value: match ? match[0] : String(beatVal.takeaway),
              label: beat.label,
              source: beatVal.source || 'Compound Wealth Analysis'
            };
          }
        }

        const dur = (typeof beatVal === 'object' && beatVal.durationSeconds)
          ? Number(beatVal.durationSeconds)
          : beat.defaultDur;

        scenes.push({
          id: beat.id,
          beat: beat.key,
          sceneType: beat.id,
          label: beat.label,
          scriptText: scriptText || beat.label,
          duration: Math.max(3, dur),
          verifiedData
        });
      }
    }

    if (!hasStoryBeats && Array.isArray(shortsScript.mainContent?.sections)) {
      shortsScript.mainContent.sections.forEach((section, idx) => {
        let text = '';
        if (Array.isArray(section.content)) text = section.content.filter(l => typeof l === 'string' && !l.startsWith('[')).join(' ');
        else if (typeof section.content === 'string') text = section.content;
        else if (section.summary) text = section.summary;

        scenes.push({
          id: `section_${idx + 1}`,
          beat: `section_${idx + 1}`,
          sceneType: `section_${idx + 1}`,
          label: section.title || `Beat ${idx + 1}`,
          scriptText: text || section.title || `Beat ${idx + 1}`,
          duration: Math.max(3, section.duration || 6)
        });
      });
    }

    const ctaVal = shortsScript.callToAction?.subscribe || shortsScript.cta || '';
    const ctaText = typeof ctaVal === 'object' ? (ctaVal.text || ctaVal.actionText || '') : String(ctaVal || '');
    if (ctaText) {
      scenes.push({
        id: 'cta',
        beat: 'cta',
        sceneType: 'cta',
        label: 'Action',
        scriptText: ctaText,
        duration: Math.max(3, parseInt(ctaVal?.durationSeconds || ctaVal?.duration, 10) || 4),
        isCTA: true
      });
    }

    // Scale durations to totalDuration if provided
    if (options.totalDuration && options.totalDuration > 0 && scenes.length > 0) {
      const currentSum = scenes.reduce((sum, s) => sum + s.duration, 0);
      if (currentSum > 0) {
        const ratio = options.totalDuration / currentSum;
        scenes.forEach(s => {
          s.duration = Math.max(2.5, Number((s.duration * ratio).toFixed(2)));
        });
      }
    }

    return scenes;
  }

  async generateScriptWithAI(strategy, template, appliedDNA = null) {
    if (!this.aiTextService.isAvailable()) {
      this.logger.info('Using template script generation because no AI text provider is configured');
      return null;
    }

    const dnaGuidanceBlock = this.buildDNAGuidancePrompt(appliedDNA);

    const prompt = `You are writing a high-retention YouTube Shorts script (30-45 seconds total, maximum 90 spoken words).
The narrative MUST follow the retention arc: HOOK → CURIOSITY GAP → DATA REVEAL → ESCALATION → PAYOFF → CTA.
Do NOT include generic boilerplate like "Hey everyone, welcome back" or "In this video".
The hook MUST create an immediate open loop with a specific dollar amount, percentage, or relatable financial shock.
The payoff MUST directly resolve the curiosity loop set by the hook.

Return only valid JSON with this exact shape:
{
  "title": "compelling punchy title under 60 characters #Shorts",
  "hook": "shocking opening hook with specific dollar/number/stakes (under 15 words)",
  "curiosityGap": "surprising stat or hidden reality that creates tension (1-2 sentences)",
  "dataReveal": "the concrete numbers or financial contrast (e.g. $10/mo vs $26,000)",
  "escalation": "the reason why or hidden catch that makes it urgent (1-2 sentences)",
  "payoff": "the solution, reversal, or concrete result answering the hook (1-2 sentences)",
  "cta": "punchy 1-sentence action (under 12 words)",
  "sections": [
    { "title": "Curiosity Gap", "content": ["spoken curiosity text"], "duration": 5 },
    { "title": "Key Data", "content": ["spoken data reveal text"], "duration": 7 },
    { "title": "Escalation", "content": ["spoken escalation text"], "duration": 7 },
    { "title": "The Payoff", "content": ["spoken payoff text"], "duration": 7 }
  ],
  "claims": [
    { "text": "specific factual claim a reviewer must verify", "riskLevel": "standard|high", "sourceUrls": ["exact supplied source URL"] }
  ]
}

Topic: ${strategy.topic}
Style/content type: ${strategy.contentType || 'story'}
Angle: ${strategy.angle}
Target audience: ${strategy.targetAudience}
Desired length: 30-45 seconds (Shorts)
Tone: ${template.tone}
Pacing: fast-paced, high retention
Brand voice: ${strategy.brandVoice || 'punchy, authentic, data-backed'}
Channel goal: ${strategy.channelGoal || 'help the viewer understand and act'}
Channel value proposition: ${strategy.channelValueProposition || 'give the viewer practical value'}
Editorial rationale: ${strategy.planRationale || 'fit the selected topic and audience'}
Channel constraints: ${strategy.channelConstraints || 'none beyond the factual-safety rules below'}
Preferred call to action: ${strategy.callToAction || 'punchy 1-sentence prompt'}
Keywords: ${(strategy.keywords || []).join(', ')}
Research sources: ${JSON.stringify(strategy.researchSources || [])}
${dnaGuidanceBlock}Avoid fabricated statistics, unsupported claims, and fake urgency. List every externally verifiable factual claim in claims. Use only exact URLs from Research sources; use an empty sourceUrls array when the supplied sources do not support a claim.`;

    try {
      const response = await this.aiTextService.generateText(prompt, {
        maxTokens: 1800,
        temperature: 0.7
      });
      const parsed = this.parseAIJsonResponse(response);

      if (!parsed.title || !parsed.hook) {
        throw new Error('AI script response missing required fields');
      }

      const hookObj = this.normalizeAIHook(parsed.hook);
      this.validateShortsHook(hookObj.text);

      let sections = this.normalizeAISections(parsed.sections, strategy);
      if (sections.length === 0 && (parsed.curiosityGap || parsed.dataReveal)) {
        const generatedSections = [];
        if (parsed.curiosityGap) generatedSections.push({ title: 'Curiosity Gap', content: [parsed.curiosityGap], duration: 5 });
        if (parsed.dataReveal) generatedSections.push({ title: 'Key Data', content: [parsed.dataReveal], duration: 7 });
        if (parsed.escalation) generatedSections.push({ title: 'Escalation', content: [parsed.escalation], duration: 7 });
        if (parsed.payoff) generatedSections.push({ title: 'The Payoff', content: [parsed.payoff], duration: 7 });
        sections = this.normalizeAISections(generatedSections, strategy);
      }

      if (sections.length === 0) {
        throw new Error('AI script response missing valid sections');
      }

      this.logger.info(`Using AI script generation via ${this.aiTextService.providerName}`);
      return {
        title: String(parsed.title).slice(0, 100),
        hook: hookObj,
        shortsStory: {
          hook: hookObj.text,
          curiosityGap: parsed.curiosityGap || '',
          dataReveal: parsed.dataReveal || '',
          escalation: parsed.escalation || '',
          payoff: parsed.payoff || '',
          cta: parsed.cta || ''
        },
        introduction: await this.generateIntroduction(strategy),
        mainContent: {
          sections,
          totalDuration: this.calculateSectionsDuration(sections)
        },
        conclusion: await this.generateConclusion(strategy),
        callToAction: this.normalizeAICTA(parsed.cta, strategy),
        duration: this.estimateDuration({ sections }),
        tone: template.tone,
        pacing: template.pacing,
        keywords: strategy.keywords || [],
        claims: this.normalizeAIClaims(parsed.claims, strategy.researchSources || []),
        metadata: {
          strategy,
          generatedAt: new Date().toISOString(),
          version: '1.0',
          generationSource: 'ai'
        }
      };
    } catch (error) {
      this.logger.warn(`AI script generation failed; using template fallback: ${error.message}`);
      return null;
    }
  }

  parseAIJsonResponse(response) {
    const text = String(response || '').trim();
    const withoutFences = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return JSON.parse(withoutFences);
    } catch (error) {
      const match = withoutFences.match(/\{[\s\S]*\}/);
      if (!match) {
        throw error;
      }
      return JSON.parse(match[0]);
    }
  }

  normalizeAIHook(hook) {
    const text = typeof hook === 'object' && hook !== null ? hook.text : hook;
    return {
      type: 'ai',
      text: String(text).trim(),
      duration: '0:00-0:05'
    };
  }

  normalizeAISections(sections, strategy) {
    if (!Array.isArray(sections)) {
      return [];
    }

    return sections
      .slice(0, 8)
      .map((section, index) => {
        const rawContent = Array.isArray(section.content)
          ? section.content
          : [section.content || section.summary || section.description];
        const content = rawContent
          .filter(Boolean)
          .map(line => String(line).trim())
          .filter(Boolean);

        return {
          type: 'ai_generated',
          title: String(section.title || `${strategy.topic} Part ${index + 1}`).trim(),
          content,
          duration: parseInt(section.duration, 10) || 60
        };
      })
      .filter(section => section.title && section.content.length > 0);
  }

  normalizeAIClaims(claims, sources) {
    if (!Array.isArray(claims)) return [];
    const allowedUrls = new Set((sources || []).map(source => source.url));
    return claims.slice(0, 25).map(item => ({
      text: String(item?.text || item?.claim || '').trim().slice(0, 1000),
      riskLevel: item?.riskLevel === 'high' ? 'high' : 'standard',
      sourceUrls: [...new Set((Array.isArray(item?.sourceUrls) ? item.sourceUrls : [])
        .map(url => String(url))
        .filter(url => allowedUrls.has(url)))]
    })).filter(item => item.text);
  }

  normalizeAICTA(cta, strategy) {
    if (cta && typeof cta === 'object') {
      return {
        type: 'call_to_action',
        subscribe: String(cta.subscribe || cta.text || `Subscribe for more on ${strategy.topic}.`),
        like: String(cta.like || 'Like this video if it helped.'),
        comment: String(cta.comment || `Share your experience with ${strategy.topic} in the comments.`),
        nextVideo: String(cta.nextVideo || 'Watch the next related video for more context.'),
        duration: '15 seconds'
      };
    }

    return {
      type: 'call_to_action',
      subscribe: String(cta || `Subscribe for more practical videos about ${strategy.topic}.`),
      like: 'Like this video if it helped.',
      comment: `Share your experience with ${strategy.topic} in the comments.`,
      nextVideo: 'Watch the next related video for more context.',
      duration: '15 seconds'
    };
  }
  async generateTitle(strategy) {
    const templates = [
      strategy.angle ? `${strategy.angle}` : null,
      `${strategy.topic}: The Complete Guide`,
      `Everything You Need to Know About ${strategy.topic}`,
      `${strategy.topic} in ${new Date().getFullYear()}: What's Changed?`,
      `The Truth About ${strategy.topic} (Shocking Results)`,
      `How to Master ${strategy.topic} in 30 Days`,
      `${strategy.topic}: Beginner to Expert Guide`
    ].filter(Boolean);

    // Select based on content type
    if (strategy.contentType === 'Tutorial') {
      return `How to ${strategy.topic}: Step-by-Step Guide`;
    } else if (strategy.contentType === 'List') {
      return `Top 10 ${strategy.topic} Tips You Need to Know`;
    } else if (strategy.contentType === 'Review') {
      return `${strategy.topic} Review: Is It Worth It?`;
    }

    return templates[Math.floor(Math.random() * templates.length)];
  }

  async generateHook(strategy, appliedDNA = null) {
    const hooks = [
      {
        type: 'question',
        text: `Have you ever wondered ${this.generateQuestionAbout(strategy.topic)}?`
      },
      {
        type: 'statistic',
        text: `Did you know that ${this.generateStatistic(strategy.topic)}?`
      },
      {
        type: 'statement',
        text: `${strategy.topic} is about to change everything, and here's why...`
      },
      {
        type: 'challenge',
        text: `Most people think they understand ${strategy.topic}, but they're completely wrong.`
      },
      {
        type: 'promise',
        text: `In the next few minutes, you'll learn exactly how to master ${strategy.topic}.`
      }
    ];

    let selected = null;
    const activeDNA = appliedDNA || this.extractApplicableContentDNA(strategy);

    if (activeDNA?.preferredHookType) {
      const matching = hooks.filter(h => h.type.toLowerCase() === activeDNA.preferredHookType.toLowerCase());
      // Preserve 20% exploration unless caller explicitly requests deterministic behavior
      const shouldExplore = strategy.exploreHook !== false && Math.random() < 0.20;
      if (matching.length > 0 && !shouldExplore) {
        selected = matching[Math.floor(Math.random() * matching.length)];
      }
    }

    if (!selected) {
      selected = hooks[Math.floor(Math.random() * hooks.length)];
    }

    const durationSec = activeDNA?.averageHookDuration
      ? Math.min(9, Math.max(2, Math.round(activeDNA.averageHookDuration)))
      : 5;
    
    return {
      type: selected.type,
      text: selected.text,
      duration: `0:00-0:0${durationSec}`
    };
  }

  generateQuestionAbout(topic) {
    const questions = [
      `why ${topic} is becoming so important`,
      `how ${topic} actually works`,
      `what makes ${topic} different from everything else`,
      `why experts are talking about ${topic}`,
      `how ${topic} could change your life`
    ];
    
    return questions[Math.floor(Math.random() * questions.length)];
  }

  generateStatistic(topic) {
    const stats = [
      `many people are still figuring out how ${topic} works`,
      `the conversation around ${topic} keeps expanding`,
      `experts continue to debate where ${topic} is headed`,
      `people often miss the practical side of ${topic}`,
      `${topic} can be easier to approach with a clear framework`
    ];
    
    return stats[Math.floor(Math.random() * stats.length)];
  }

  async generateIntroduction(strategy) {
    return {
      greeting: "Hey everyone, welcome back to the channel!",
      topicIntro: `Today, we're diving deep into ${strategy.topic}.`,
      valueProposition: `By the end of this video, you'll understand exactly ${this.getValueProposition(strategy)}.`,
      credibility: this.getCredibilityStatement(strategy),
      duration: '0:05-0:20'
    };
  }

  getValueProposition(strategy) {
    const propositions = {
      'Tutorial': `how to implement ${strategy.topic} step by step`,
      'Explainer': `what ${strategy.topic} is and why it matters`,
      'List': `the most important things about ${strategy.topic}`,
      'Review': `whether ${strategy.topic} is right for you`,
      'Story': `the incredible journey of ${strategy.topic}`
    };
    
    return propositions[strategy.contentType] || `everything about ${strategy.topic}`;
  }

  getCredibilityStatement(_strategy) {
    const statements = [
      "I've spent months researching this topic",
      "After working with hundreds of people on this",
      "Based on the latest research and data",
      "Drawing from real-world experience",
      "Using proven methods and strategies"
    ];
    
    return statements[Math.floor(Math.random() * statements.length)];
  }

  async generateMainContent(strategy, template) {
    const sections = [];
    
    for (const section of template.structure) {
      if (!['hook', 'introduction', 'cta'].includes(section)) {
        sections.push(await this.generateSection(section, strategy));
      }
    }
    
    return {
      sections,
      totalDuration: this.calculateSectionsDuration(sections)
    };
  }

  async generateSection(sectionType, strategy) {
    const sectionGenerators = {
      problem: () => this.generateProblemSection(strategy),
      solution_steps: () => this.generateSolutionSteps(strategy),
      demonstration: () => this.generateDemonstration(strategy),
      explanation: () => this.generateExplanation(strategy),
      examples: () => this.generateExamples(strategy),
      list_items: () => this.generateListItems(strategy),
      pros: () => this.generatePros(strategy),
      cons: () => this.generateCons(strategy),
      comparison: () => this.generateComparison(strategy),
      implications: () => this.generateImplications(strategy)
    };

    const generator = sectionGenerators[sectionType];
    
    if (generator) {
      return await generator();
    }
    
    return this.generateGenericSection(sectionType, strategy);
  }

  async generateProblemSection(strategy) {
    return {
      type: 'problem',
      title: 'The Challenge',
      content: [
        `Many people struggle with ${strategy.topic}.`,
        `The main issues are:`,
        `1. Lack of clear information`,
        `2. Complexity and confusion`,
        `3. Not knowing where to start`,
        `But don't worry, we're going to solve all of these today.`
      ],
      visuals: ['Problem illustration', 'Statistics graphic'],
      duration: 30
    };
  }

  async generateSolutionSteps(strategy) {
    const steps = [];
    const numSteps = 3 + Math.floor(Math.random() * 3); // 3-5 steps
    
    for (let i = 1; i <= numSteps; i++) {
      steps.push({
        number: i,
        title: `Step ${i}: ${this.generateStepTitle(strategy.topic, i)}`,
        description: this.generateStepDescription(strategy.topic, i),
        tip: this.generateProTip(strategy.topic)
      });
    }
    
    return {
      type: 'solution_steps',
      title: 'The Solution',
      steps,
      duration: steps.length * 45
    };
  }

  generateStepTitle(topic, stepNumber) {
    const titles = [
      'Research and Preparation',
      'Setting Up the Foundation',
      'Implementation and Execution',
      'Testing and Optimization',
      'Scaling and Automation'
    ];
    
    return titles[stepNumber - 1] || `Advanced ${topic} Techniques`;
  }

  generateStepDescription(topic, _stepNumber) {
    return `This step involves understanding the key aspects of ${topic} and how to apply them effectively. Pay special attention to the details here, as they make all the difference.`;
  }

  generateProTip(_topic) {
    const tips = [
      `Pro tip: Start small and scale gradually`,
      `Remember: Consistency is more important than perfection`,
      `Quick tip: Document everything as you go`,
      `Expert advice: Focus on one aspect at a time`,
      `Insider secret: This works best when combined with regular practice`
    ];
    
    return tips[Math.floor(Math.random() * tips.length)];
  }

  async generateDemonstration(_strategy) {
    return {
      type: 'demonstration',
      title: 'Live Demo',
      content: [
        `Now let me show you exactly how this works.`,
        `[Screen recording or visual demonstration]`,
        `As you can see, the process is straightforward once you understand the basics.`,
        `The key is to follow the steps exactly as shown.`
      ],
      visuals: ['Screen recording', 'Step-by-step graphics'],
      duration: 120
    };
  }

  async generateExplanation(strategy) {
    return {
      type: 'explanation',
      title: 'Deep Dive',
      content: [
        `Let's break down ${strategy.topic} into its core components.`,
        `First, we need to understand the fundamental principles.`,
        `The science behind this is fascinating...`,
        `[Detailed explanation with visuals]`,
        `This is why ${strategy.topic} works so effectively.`
      ],
      visuals: ['Diagrams', 'Infographics', 'Charts'],
      duration: 90
    };
  }

  async generateExamples(strategy) {
    return {
      type: 'examples',
      title: 'Real-World Examples',
      content: [
        `Let's look at some real examples of ${strategy.topic} in action.`,
        `Example 1: [Specific case study]`,
        `Example 2: [Another relevant example]`,
        `Example 3: [Third compelling example]`,
        `These examples show the versatility and power of ${strategy.topic}.`
      ],
      visuals: ['Case study graphics', 'Before/after comparisons'],
      duration: 75
    };
  }

  async generateListItems(strategy) {
    const items = [];
    const numItems = 5 + Math.floor(Math.random() * 6); // 5-10 items
    
    for (let i = 1; i <= numItems; i++) {
      items.push({
        number: numItems - i + 1, // Countdown for engagement
        title: this.generateListItemTitle(strategy.topic, i),
        description: this.generateListItemDescription(strategy.topic),
        impact: this.generateImpactStatement()
      });
    }
    
    return {
      type: 'list_items',
      title: `Top ${numItems} Things About ${strategy.topic}`,
      items,
      duration: items.length * 30
    };
  }

  generateListItemTitle(topic, index) {
    const titles = [
      `The Hidden Power of ${topic}`,
      `Why ${topic} Matters More Than You Think`,
      `The Surprising Truth About ${topic}`,
      `How ${topic} Can Transform Your Approach`,
      `The ${topic} Secret Nobody Talks About`,
      `Mastering ${topic} in Record Time`,
      `The Ultimate ${topic} Hack`,
      `${topic}: The Game Changer`,
      `Breaking Down ${topic} Myths`,
      `The Future of ${topic}`
    ];
    
    return titles[index - 1] || `Advanced ${topic} Technique #${index}`;
  }

  generateListItemDescription(topic) {
    return `This aspect of ${topic} is crucial because it fundamentally changes how we approach the subject. Understanding this will give you a significant advantage.`;
  }

  generateImpactStatement() {
    const impacts = [
      'This alone can save you hours',
      'Game-changing for beginners',
      'Essential for long-term success',
      'Often overlooked but critical',
      'The difference between success and failure'
    ];
    
    return impacts[Math.floor(Math.random() * impacts.length)];
  }

  async generatePros(_strategy) {
    return {
      type: 'pros',
      title: 'The Benefits',
      points: [
        'Easy to get started',
        'Cost-effective solution',
        'Proven results',
        'Scalable approach',
        'Community support'
      ],
      duration: 45
    };
  }

  async generateCons(_strategy) {
    return {
      type: 'cons',
      title: 'Things to Consider',
      points: [
        'Learning curve at the beginning',
        'Requires consistent effort',
        'Results may vary',
        'Some technical knowledge helpful'
      ],
      duration: 30
    };
  }

  async generateComparison(strategy) {
    return {
      type: 'comparison',
      title: 'How It Compares',
      content: `Compared to alternatives, ${strategy.topic} stands out because of its unique approach and proven effectiveness.`,
      comparisonPoints: [
        'More efficient than traditional methods',
        'Better ROI than competitors',
        'Easier to implement',
        'More sustainable long-term'
      ],
      duration: 60
    };
  }

  async generateImplications(strategy) {
    return {
      type: 'implications',
      title: 'What This Means',
      content: [
        `The implications of ${strategy.topic} are far-reaching.`,
        'This will change how we think about the industry.',
        'Early adopters will have a significant advantage.',
        'The potential for growth is enormous.'
      ],
      duration: 45
    };
  }

  generateGenericSection(sectionType, strategy) {
    return {
      type: sectionType,
      title: sectionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      content: `This section covers important aspects of ${strategy.topic} that you need to know.`,
      duration: 60
    };
  }

  async generateConclusion(strategy) {
    return {
      type: 'conclusion',
      title: 'Wrapping Up',
      recap: [
        `So that's everything you need to know about ${strategy.topic}.`,
        'We covered the key points:',
        '- The fundamentals and why they matter',
        '- Practical steps to get started',
        '- Real-world applications and examples',
        '- Tips for long-term success'
      ],
      finalThought: `Remember, ${strategy.topic} is a journey, not a destination. Keep learning and improving!`,
      duration: '30 seconds'
    };
  }

  async generateCTA(strategy) {
    return {
      type: 'call_to_action',
      subscribe: "If you found this helpful, make sure to subscribe and hit the notification bell!",
      like: "Give this video a thumbs up if you learned something new.",
      comment: `Let me know in the comments: What's your experience with ${strategy.topic}?`,
      nextVideo: "Check out this related video for more insights.",
      duration: '15 seconds'
    };
  }

  formatFullScript(script) {
    let fullScript = '';
    
    // Title
    fullScript += `TITLE: ${script.title}\n\n`;
    fullScript += '═'.repeat(50) + '\n\n';
    
    // Hook
    fullScript += `[${script.hook.duration}] HOOK\n`;
    fullScript += `${script.hook.text}\n\n`;
    
    // Introduction
    fullScript += `[${script.introduction.duration}] INTRODUCTION\n`;
    fullScript += `${script.introduction.greeting}\n`;
    fullScript += `${script.introduction.topicIntro}\n`;
    fullScript += `${script.introduction.valueProposition}\n`;
    fullScript += `${script.introduction.credibility}\n\n`;
    
    // Main Content
    fullScript += 'MAIN CONTENT\n';
    fullScript += '─'.repeat(30) + '\n\n';
    
    for (const section of script.mainContent.sections) {
      fullScript += `[${this.formatDuration(section.duration)}] ${section.title.toUpperCase()}\n`;
      
      if (Array.isArray(section.content)) {
        section.content.forEach(line => {
          fullScript += `${line}\n`;
        });
      } else if (section.steps) {
        section.steps.forEach(step => {
          fullScript += `\n${step.title}\n`;
          fullScript += `${step.description}\n`;
          fullScript += `💡 ${step.tip}\n`;
        });
      } else if (section.items) {
        section.items.forEach(item => {
          fullScript += `\n#${item.number}: ${item.title}\n`;
          fullScript += `${item.description}\n`;
          fullScript += `Impact: ${item.impact}\n`;
        });
      } else if (section.points) {
        section.points.forEach(point => {
          fullScript += `• ${point}\n`;
        });
      } else {
        fullScript += `${section.content}\n`;
      }
      
      if (section.visuals) {
        fullScript += `\n[VISUALS: ${section.visuals.join(', ')}]\n`;
      }
      
      fullScript += '\n';
    }
    
    // Conclusion
    fullScript += `[${script.conclusion.duration}] CONCLUSION\n`;
    script.conclusion.recap.forEach(line => {
      fullScript += `${line}\n`;
    });
    fullScript += `\n${script.conclusion.finalThought}\n\n`;
    
    // Call to Action
    fullScript += `[${script.callToAction.duration}] CALL TO ACTION\n`;
    fullScript += `${script.callToAction.subscribe}\n`;
    fullScript += `${script.callToAction.like}\n`;
    fullScript += `${script.callToAction.comment}\n`;
    fullScript += `${script.callToAction.nextVideo}\n\n`;
    
    // Metadata
    fullScript += '═'.repeat(50) + '\n';
    fullScript += `ESTIMATED DURATION: ${script.duration}\n`;
    fullScript += `TONE: ${script.tone}\n`;
    fullScript += `PACING: ${script.pacing}\n`;
    fullScript += `KEYWORDS: ${(script.keywords || []).join(', ')}\n`;
    
    return fullScript;
  }

  estimateDuration(mainContent) {
    const totalSeconds = mainContent.sections.reduce((total, section) => {
      return total + (section.duration || 60);
    }, 0);
    
    // Add hook, intro, conclusion, CTA
    const fullDuration = totalSeconds + 5 + 15 + 30 + 15;
    
    return this.formatDuration(fullDuration);
  }

  formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  calculateSectionsDuration(sections) {
    return sections.reduce((total, section) => total + (section.duration || 60), 0);
  }
}

function validateShortsHook(hookInput) {
  const agent = new ScriptWriterAgent();
  return agent.validateShortsHook(hookInput);
}

function buildShortsSceneList(shortsScript, options = {}) {
  const agent = new ScriptWriterAgent();
  return agent.buildShortsSceneList(shortsScript, options);
}

module.exports = {
  ScriptWriterAgent,
  validateShortsHook,
  buildShortsSceneList
};


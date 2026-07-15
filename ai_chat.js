(function() {
  var BUILTIN_API_KEY = 'sk-ws-H.EDLDHER.5YCi.MEQCIHacg2lW-k9Nu-HZWhqxOLLcuTjNn78ToFNZOxSfmfoRAiA__nuKdrbVXEGbc8Xsp9AUVhmv1MqCTzubvsxseHBqLw';
  
  var freeModels = [
    { name: 'qwen3.7-plus', label: '通义千问 3.7 Plus', provider: 'qwen' },
    { name: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', provider: 'deepseek' },
    { name: 'qwen3.6-flash-2026-04-16', label: '通义千问 3.6 Flash', provider: 'qwen' },
    { name: 'qwen3.7-max-preview', label: '通义千问 3.7 Max Preview', provider: 'qwen' },
    { name: 'qwen3.6-max-preview', label: '通义千问 3.6 Max Preview', provider: 'qwen' },
    { name: 'qwen3.5-plus-plus-2026-04-20', label: '通义千问 3.5 Plus+', provider: 'qwen' }
  ];
  
  var currentModelIndex = 0;
  
  var providerConfigs = {
    deepseek: { url: 'https://api.deepseek.com/v1/chat/completions', defaultModel: 'deepseek-chat' },
    zhipu: { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', defaultModel: 'glm-4-flash' },
    qwen: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', defaultModel: 'qwen-turbo' },
    openai: { url: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4o-mini' }
  };

  var quickQuestions = [
    { text: '最近压力大，哪款适合安神助眠？', q: '最近压力大，哪款合香珠适合安神助眠？' },
    { text: '夏季闷热，有什么清凉香推荐？', q: '夏季闷热，有什么清凉解暑的合香珠推荐？' },
    { text: '想送给长辈，哪款最适合？', q: '想送给长辈，哪款合香珠最适合作为礼物？' },
    { text: '我是敏感体质，能戴吗？', q: '我是敏感体质，能佩戴合香珠吗？有没有温和不刺激的推荐？' },
    { text: '每天佩戴需要注意什么？', q: '合香珠每天佩戴需要注意什么？如何保养？' }
  ];

  function tokenize(text) {
    var result = [];
    var chinesePattern = /[\u4e00-\u9fa5]{2,}/g;
    var match;
    while ((match = chinesePattern.exec(text)) !== null) {
      result.push(match[0]);
    }
    var wordPattern = /[a-zA-Z]+/g;
    while ((match = wordPattern.exec(text)) !== null) {
      result.push(match[0].toLowerCase());
    }
    return result;
  }

  function getWordFrequency(tokens) {
    var freq = {};
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      freq[token] = (freq[token] || 0) + 1;
    }
    return freq;
  }

  function calculateSimilarity(queryTokens, chunkContent) {
    if (!chunkContent) return 0;
    
    var chunkTokens = tokenize(chunkContent);
    if (chunkTokens.length === 0) return 0;
    
    var queryFreq = getWordFrequency(queryTokens);
    var chunkFreq = getWordFrequency(chunkTokens);
    
    var intersection = 0;
    var queryTotal = 0;
    
    for (var word in queryFreq) {
      queryTotal += queryFreq[word];
      if (chunkFreq[word]) {
        intersection += Math.min(queryFreq[word], chunkFreq[word]);
      }
    }
    
    if (queryTotal === 0) return 0;
    
    var jaccard = intersection / (queryTokens.length + chunkTokens.length - intersection);
    var overlap = intersection / queryTotal;
    
    return jaccard * 0.6 + overlap * 0.4;
  }

  function retrieveRAGChunks(query, topK) {
    if (!window.RAG_CHUNKS || !window.RAG_CHUNKS.length) return [];
    
    var queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];
    
    var scoredChunks = [];
    
    for (var i = 0; i < window.RAG_CHUNKS.length; i++) {
      var chunk = window.RAG_CHUNKS[i];
      var score = calculateSimilarity(queryTokens, chunk.content);
      if (score > 0.03) {
        scoredChunks.push({ score: score, chunk: chunk });
      }
    }
    
    scoredChunks.sort(function(a, b) {
      return b.score - a.score;
    });
    
    var results = scoredChunks.slice(0, topK);
    
    var productSections = {};
    var finalResults = [];
    
    for (var j = 0; j < results.length; j++) {
      var item = results[j];
      var meta = item.chunk.metadata;
      var key = meta.monthCn + '-' + meta.section;
      
      if (!productSections[key]) {
        productSections[key] = true;
        finalResults.push(item);
      }
    }
    
    return finalResults.slice(0, topK);
  }

  function buildContextFromChunks(chunks) {
    if (!chunks || chunks.length === 0) return '';
    
    var context = '\n【参考资料】\n';
    var productGroups = {};
    
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i].chunk;
      var meta = chunk.metadata;
      var productKey = meta.monthCn + '·' + meta.productName;
      
      if (!productGroups[productKey]) {
        productGroups[productKey] = {
          meta: meta,
          sections: {}
        };
      }
      
      if (!productGroups[productKey].sections[meta.section]) {
        productGroups[productKey].sections[meta.section] = [];
      }
      productGroups[productKey].sections[meta.section].push(chunk.content);
    }
    
    for (var key in productGroups) {
      var group = productGroups[key];
      context += '\n【' + key + '】\n';
      context += '- 花神：' + group.meta.flower + ' · ' + group.meta.goddess + '\n';
      context += '- 节气：' + (group.meta.season || '未知') + '\n';
      if (group.meta.effects && group.meta.effects.length > 0) {
        context += '- 核心功效：' + group.meta.effects.join('、') + '\n';
      }
      
      for (var section in group.sections) {
        var contents = group.sections[section];
        context += '- ' + section + '：' + contents.join('') + '\n';
      }
    }
    
    return context;
  }

  function buildSystemPrompt(userQuery) {
    var retrievedChunks = retrieveRAGChunks(userQuery, 8);
    var context = buildContextFromChunks(retrievedChunks);
    
    return '你是「慈莲如意·思愈界」的AI香道顾问，专业、温柔、有文化底蕴。' +
      '你只推荐我们的十二花神合香珠系列产品，绝不提其他品牌或产品。' +
      (context || '') +
      '\n\n回答要求：' +
      '1. 根据用户需求，结合上述资料推荐最合适的合香珠产品。' +
      '2. 回答要详细、专业，包含产品特点、香味描述、功效说明等信息。' +
      '3. 语气温柔雅致，有东方美学韵味，善用诗意表达。' +
      '4. 必须基于提供的资料回答，不要编造信息。' +
      '5. 如果用户问的问题在资料中没有相关信息，请诚实说明，并引导用户提出其他问题。' +
      '6. 推荐产品时要说明推荐理由，对比不同产品的特点。';
  }

  var conversationHistory = [];

  function addMessage(role, content, isTyping) {
    var container = document.getElementById('aiChatMessages');
    var msg = document.createElement('div');
    msg.className = 'msg ' + role;
    if (isTyping) {
      msg.classList.add('typing');
      msg.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    } else {
      msg.innerHTML = content.replace(/\n/g, '<br>');
    }
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    return msg;
  }

  function getCurrentModel() {
    return freeModels[currentModelIndex];
  }

  function switchToNextModel() {
    currentModelIndex = (currentModelIndex + 1) % freeModels.length;
    updateModelDisplay();
  }

  function updateModelDisplay() {
    var modelLabel = document.getElementById('aiModelLabel');
    if (modelLabel) {
      var current = getCurrentModel();
      modelLabel.textContent = current.label;
    }
  }

  function streamChat(userMessage, retryCount) {
    retryCount = retryCount || 0;
    var currentModel = getCurrentModel();
    var config = providerConfigs[currentModel.provider];
    var model = currentModel.name;

    conversationHistory.push({ role: 'user', content: userMessage });
    var typingMsg = addMessage('ai', '', true);

    var messages = [
      { role: 'system', content: buildSystemPrompt(userMessage) }
    ];
    for (var i = Math.max(0, conversationHistory.length - 10); i < conversationHistory.length; i++) {
      messages.push(conversationHistory[i]);
    }

    fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + BUILTIN_API_KEY },
      body: JSON.stringify({ model: model, messages: messages, stream: true, temperature: 0.7, max_tokens: 2000 })
    }).then(function(response) {
      if (!response.ok) {
        return response.text().then(function(t) {
          throw new Error('API错误(' + response.status + '): ' + t.substring(0, 100));
        });
      }
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var fullContent = '';
      var buffer = '';

      typingMsg.classList.remove('typing');
      typingMsg.innerHTML = '';

      function read() {
        return reader.read().then(function(result) {
          if (result.done) return;
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (var i = 0; i < lines.length; i++) {
            var trimmed = lines[i].trim();
            if (!trimmed || trimmed.indexOf('data: ') !== 0) continue;
            var data = trimmed.substring(6).trim();
            if (data === '[DONE]') continue;
            try {
              var json = JSON.parse(data);
              var delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
              if (delta) {
                fullContent += delta;
                typingMsg.innerHTML = fullContent.replace(/\n/g, '<br>');
                document.getElementById('aiChatMessages').scrollTop = 99999;
              }
            } catch(e) {}
          }
          return read();
        });
      }

      return read().then(function() {
        if (!fullContent) {
          typingMsg.innerHTML = '（未收到回复，请检查网络连接是否正常）';
        } else {
          conversationHistory.push({ role: 'assistant', content: fullContent });
        }
      });
    }).catch(function(error) {
      typingMsg.classList.remove('typing');
      if (retryCount < freeModels.length - 1) {
        typingMsg.innerHTML = '<strong>' + currentModel.label + ' 不可用，正在切换到下一个模型...</strong>';
        switchToNextModel();
        setTimeout(function() {
          typingMsg.remove();
          streamChat(userMessage, retryCount + 1);
        }, 1500);
      } else {
        typingMsg.innerHTML = '<strong>所有模型均不可用：</strong>' + error.message + '<br><br>请稍后再试。';
      }
    });
  }

  function createQuickQuestions() {
    var container = document.getElementById('quickQuestions');
    if (!container) return;
    
    container.innerHTML = '';
    for (var i = 0; i < quickQuestions.length; i++) {
      var q = quickQuestions[i];
      var btn = document.createElement('button');
      btn.className = 'quick-q';
      btn.textContent = q.text;
      btn.setAttribute('data-q', q.q);
      btn.addEventListener('click', function() {
        var input = document.getElementById('aiChatInput');
        input.value = this.getAttribute('data-q');
        sendMessage();
      });
      container.appendChild(btn);
    }
  }

  function init() {
    var btn = document.getElementById('aiChatBtn');
    var panel = document.getElementById('aiChatPanel');
    var closeBtn = document.getElementById('aiChatClose');
    var input = document.getElementById('aiChatInput');
    var sendBtn = document.getElementById('aiChatSend');
    var modelSelect = document.getElementById('aiModelSelect');

    if (modelSelect) {
      for (var i = 0; i < freeModels.length; i++) {
        var option = document.createElement('option');
        option.value = i;
        option.textContent = freeModels[i].label;
        modelSelect.appendChild(option);
      }
      modelSelect.addEventListener('change', function() {
        currentModelIndex = parseInt(this.value);
        updateModelDisplay();
      });
    }

    btn.addEventListener('click', function() {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) input.focus();
    });
    closeBtn.addEventListener('click', function() { panel.classList.remove('open'); });

    function sendMessage() {
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      input.style.height = 'auto';
      addMessage('user', text);
      streamChat(text);
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    input.addEventListener('input', function() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    createQuickQuestions();
    updateModelDisplay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
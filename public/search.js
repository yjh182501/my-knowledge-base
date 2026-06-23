// ========== 文章内搜索面板 ==========
var postSearchMatches = [];
var postSearchActiveIndex = -1;

function togglePostSearch() {
  var panel = document.getElementById('post-search-panel');
  var overlay = document.getElementById('post-search-overlay');
  var btn = document.getElementById('post-search-toggle');
  panel.classList.toggle('open');
  overlay.classList.toggle('visible');
  btn.classList.toggle('visible');
  if (panel.classList.contains('open')) {
    document.getElementById('post-search-input').focus();
  } else {
    clearAllHighlights();
  }
}

function updateNavState() {
  var prevBtn = document.getElementById('post-search-prev');
  var nextBtn = document.getElementById('post-search-next');
  var badge = document.getElementById('post-search-badge');
  var total = postSearchMatches.length;

  if (total === 0) {
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    badge.textContent = '0/0';
    return;
  }

  var idx = postSearchActiveIndex >= 0 ? postSearchActiveIndex : 0;
  badge.textContent = (idx + 1) + '/' + total;
  prevBtn.disabled = (total <= 1);
  nextBtn.disabled = (total <= 1);
}

function doPostSearch(q) {
  q = q.trim();
  var countEl = document.getElementById('post-search-count');
  var resultsEl = document.getElementById('post-search-results');
  postSearchActiveIndex = -1;

  if (!q) {
    countEl.innerHTML = '<span>输入关键词开始搜索</span><span class="post-search-hint"><kbd>Enter</kbd> 下一个 <kbd>Esc</kbd> 关闭</span>';
    resultsEl.innerHTML = '<div class="post-search-no-results">输入关键词开始搜索</div>';
    clearAllHighlights();
    updateNavState();
    return;
  }

  // 提取正文纯文本
  var contentEl = document.querySelector('.post-content');
  if (!contentEl) return;

  // 获取所有文本节点
  var walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null, false);
  var allTextNodes = [];
  while (walker.nextNode()) allTextNodes.push(walker.currentNode);

  var fullText = allTextNodes.map(function(n) { return n.textContent; }).join('\n');
  var escapedQ = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  var regex = new RegExp(escapedQ, 'gi');

  // 查找所有匹配
  postSearchMatches = [];
  var match;
  while ((match = regex.exec(fullText)) !== null) {
    var pos = match.index;
    var start = Math.max(0, pos - 40);
    var end = Math.min(fullText.length, pos + q.length + 40);
    var ctx = (start > 0 ? '...' : '') + fullText.substring(start, end) + (end < fullText.length ? '...' : '');
    postSearchMatches.push({
      index: pos,
      text: match[0],
      context: ctx,
      start: start,
      end: end
    });
    regex.lastIndex = pos + 1; // 避免死循环
  }

  if (postSearchMatches.length === 0) {
    countEl.innerHTML = '<span>未找到匹配内容</span><span class="post-search-hint"><kbd>Enter</kbd> 下一个 <kbd>Esc</kbd> 关闭</span>';
    resultsEl.innerHTML = '<div class="post-search-no-results">未找到匹配内容</div>';
    clearAllHighlights();
    updateNavState();
    return;
  }

  countEl.innerHTML = '<span>找到 ' + postSearchMatches.length + ' 处匹配</span><span class="post-search-hint"><kbd>Enter</kbd> 下一个 <kbd>Esc</kbd> 关闭</span>';

  // 渲染结果列表
  resultsEl.innerHTML = postSearchMatches.map(function(m, i) {
    var highlightedCtx = escapeHtml(m.context).replace(
      new RegExp(escapeHtml(m.text), 'gi'),
      '<mark>' + escapeHtml(m.text) + '</mark>'
    );
    return '<div class="post-search-result-item" data-index="' + i + '" onclick="jumpToMatch(' + i + ')">' +
      '<div class="result-context">' + highlightedCtx + '</div>' +
      '</div>';
  }).join('');

  // 高亮正文中的所有匹配
  highlightAllInContent(q, escapedQ);

  // 默认选中第一个匹配
  postSearchActiveIndex = 0;
  updateNavState();
  scrollToActiveMatch();
  highlightActiveResultItem();
}

function postSearchKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) {
      prevMatch();
    } else {
      nextMatch();
    }
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    togglePostSearch();
  }
}

function nextMatch() {
  var total = postSearchMatches.length;
  if (total === 0) return;
  postSearchActiveIndex = (postSearchActiveIndex + 1) % total;
  doJumpToMatch();
}

function prevMatch() {
  var total = postSearchMatches.length;
  if (total === 0) return;
  postSearchActiveIndex = (postSearchActiveIndex - 1 + total) % total;
  doJumpToMatch();
}

function doJumpToMatch() {
  scrollToActiveMatch();
  highlightActiveResultItem();
  updateNavState();
}

function scrollToActiveMatch() {
  var contentEl = document.querySelector('.post-content');
  if (!contentEl) return;
  var marks = contentEl.querySelectorAll('mark.search-highlight');
  var idx = postSearchActiveIndex;
  if (marks.length > 0 && marks[idx]) {
    marks[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    // 闪烁高亮效果
    marks[idx].style.transition = 'background 2s, box-shadow 2s';
    marks[idx].style.background = '#fde68a';
    marks[idx].style.boxShadow = '0 0 0 4px #fcd34d';
    setTimeout(function() {
      marks[idx].style.background = '#fef08a';
      marks[idx].style.boxShadow = '0 0 0 2px #fde047';
    }, 2500);
  }
}

function highlightActiveResultItem() {
  var items = document.querySelectorAll('.post-search-result-item');
  items.forEach(function(item) { item.classList.remove('active'); });
  var idx = postSearchActiveIndex;
  if (items[idx]) {
    items[idx].classList.add('active');
    items[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function highlightAllInContent(q, escapedQ) {
  var contentEl = document.querySelector('.post-content');
  if (!contentEl) return;

  // 先清除旧高亮
  clearAllHighlights();

  var walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null, false);
  var nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  var regex = new RegExp(escapedQ, 'gi');
  nodes.forEach(function(node) {
    if (node.textContent.toLowerCase().indexOf(q.toLowerCase()) !== -1) {
      var span = document.createElement('span');
      span.innerHTML = node.textContent.replace(regex, '<mark class="search-highlight">$&</mark>');
      node.parentNode.replaceChild(span, node);
    }
  });
}

function clearAllHighlights() {
  var contentEl = document.querySelector('.post-content');
  if (!contentEl) return;
  var marks = contentEl.querySelectorAll('mark.search-highlight');
  marks.forEach(function(mark) {
    var parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}

function jumpToMatch(index) {
  postSearchActiveIndex = index;
  var contentEl = document.querySelector('.post-content');
  if (!contentEl) return;

  // 清除旧高亮
  clearAllHighlights();

  // 高亮所有匹配
  var q = document.getElementById('post-search-input').value.trim();
  if (!q) return;
  var escapedQ = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  var regex = new RegExp(escapedQ, 'gi');

  var walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null, false);
  var nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(function(node) {
    if (node.textContent.toLowerCase().indexOf(q.toLowerCase()) !== -1) {
      var span = document.createElement('span');
      span.innerHTML = node.textContent.replace(regex, '<mark class="search-highlight">$&</mark>');
      node.parentNode.replaceChild(span, node);
    }
  });

  scrollToActiveMatch();
  highlightActiveResultItem();
  updateNavState();
}

// 全局键盘快捷键
document.addEventListener('keydown', function(e) {
  var panel = document.getElementById('post-search-panel');
  if (!panel) return;
  var isOpen = panel.classList.contains('open');

  if (e.key === 'Escape' && isOpen) {
    e.preventDefault();
    togglePostSearch();
    return;
  }

  if (e.key === 'F3' || (e.key === 'f' && (e.metaKey || e.ctrlKey))) {
    if (!isOpen) {
      togglePostSearch();
    } else {
      document.getElementById('post-search-input').focus();
      document.getElementById('post-search-input').select();
    }
    e.preventDefault();
  }

  if (e.key === 'F3' && e.shiftKey && isOpen) {
    e.preventDefault();
    prevMatch();
  }
});

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ========== 文章内搜索面板 ==========
var postSearchMatches = [];
var postSearchActiveIndex = -1;

function togglePostSearch() {
  var panel = document.getElementById('post-search-panel');
  var overlay = document.getElementById('post-search-overlay');
  var btn = document.getElementById('post-search-toggle');
  if (!panel) return;
  panel.classList.toggle('open');
  if (overlay) overlay.classList.toggle('visible');
  if (btn) btn.classList.toggle('visible');
  if (panel.classList.contains('open')) {
    var inp = document.getElementById('post-search-input');
    if (inp) { inp.focus(); inp.select(); }
  } else {
    clearAllHighlights();
  }
}

function doPostSearch(q) {
  q = q.trim();
  var countEl = document.getElementById('post-search-count');
  var resultsEl = document.getElementById('post-search-results');
  postSearchActiveIndex = -1;

  if (!q) {
    if (countEl) countEl.innerHTML = '<span>输入关键词开始搜索</span><span class="post-search-hint"><kbd>Enter</kbd> 下一个 <kbd>Esc</kbd> 关闭</span>';
    if (resultsEl) resultsEl.innerHTML = '<div class="post-search-no-results">输入关键词开始搜索</div>';
    clearAllHighlights();
    updateNavState();
    return;
  }

  var contentEl = document.querySelector('.post-content');
  if (!contentEl) return;

  var walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null, false);
  var allTextNodes = [];
  while (walker.nextNode()) allTextNodes.push(walker.currentNode);

  var fullText = allTextNodes.map(function (n) { return n.textContent; }).join('\n');
  var escapedQ = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  var regex = new RegExp(escapedQ, 'gi');

  postSearchMatches = [];
  var match;
  while ((match = regex.exec(fullText)) !== null) {
    var pos = match.index;
    var start = Math.max(0, pos - 40);
    var end = Math.min(fullText.length, pos + q.length + 40);
    var ctx = (start > 0 ? '...' : '') + fullText.substring(start, end) + (end < fullText.length ? '...' : '');
    postSearchMatches.push({ index: pos, text: match[0], context: ctx });
    regex.lastIndex = pos + 1;
  }

  if (postSearchMatches.length === 0) {
    if (countEl) countEl.innerHTML = '<span>未找到匹配内容</span><span class="post-search-hint"><kbd>Enter</kbd> 下一个 <kbd>Esc</kbd> 关闭</span>';
    if (resultsEl) resultsEl.innerHTML = '<div class="post-search-no-results">未找到匹配内容</div>';
    clearAllHighlights();
    updateNavState();
    return;
  }

  if (countEl) countEl.innerHTML = '<span>找到 ' + postSearchMatches.length + ' 处匹配</span><span class="post-search-hint"><kbd>Enter</kbd> 下一个 <kbd>Esc</kbd> 关闭</span>';

  if (resultsEl) {
    resultsEl.innerHTML = postSearchMatches.map(function (m, i) {
      var highlightedCtx = escapeHtml(m.context).replace(
        new RegExp(escapeHtml(m.text), 'gi'),
        '<mark>' + escapeHtml(m.text) + '</mark>'
      );
      return '<div class="post-search-result-item" data-index="' + i + '" onclick="jumpToMatch(' + i + ')">' +
        '<div class="result-context">' + highlightedCtx + '</div>' +
        '</div>';
    }).join('');
  }

  highlightAllInContent(q, escapedQ);
  updateNavState();
}

function highlightAllInContent(q, escapedQ) {
  var contentEl = document.querySelector('.post-content');
  if (!contentEl) return;
  clearAllHighlights();

  var walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null, false);
  var nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  var regex = new RegExp(escapedQ, 'gi');
  nodes.forEach(function (node) {
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
  marks.forEach(function (mark) {
    var parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}

function jumpToMatch(index) {
  postSearchActiveIndex = index;
  var contentEl = document.querySelector('.post-content');
  if (!contentEl) return;

  var q = document.getElementById('post-search-input').value.trim();
  if (!q) return;
  var escapedQ = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  var regex = new RegExp(escapedQ, 'gi');

  clearAllHighlights();

  var walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null, false);
  var nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(function (node) {
    if (node.textContent.toLowerCase().indexOf(q.toLowerCase()) !== -1) {
      var span = document.createElement('span');
      span.innerHTML = node.textContent.replace(regex, '<mark class="search-highlight">$&</mark>');
      node.parentNode.replaceChild(span, node);
    }
  });

  var marks = contentEl.querySelectorAll('mark.search-highlight');
  if (marks[index]) {
    marks[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    marks[index].style.transition = 'background 2s, box-shadow 2s';
    marks[index].style.background = '#fde68a';
    marks[index].style.boxShadow = '0 0 0 4px #fcd34d';
    setTimeout(function () {
      marks[index].style.background = '#fef08a';
      marks[index].style.boxShadow = '0 0 0 2px #fde047';
    }, 500);
  }

  var items = document.querySelectorAll('.post-search-result-item');
  items.forEach(function (item) { item.classList.remove('active'); });
  if (items[index]) items[index].classList.add('active');

  updateNavState();
}

function nextMatch() {
  if (postSearchMatches.length === 0) return;
  postSearchActiveIndex = (postSearchActiveIndex + 1) % postSearchMatches.length;
  jumpToMatch(postSearchActiveIndex);
}

function prevMatch() {
  if (postSearchMatches.length === 0) return;
  postSearchActiveIndex = (postSearchActiveIndex - 1 + postSearchMatches.length) % postSearchMatches.length;
  jumpToMatch(postSearchActiveIndex);
}

function updateNavState() {
  var prevBtn = document.getElementById('post-search-prev');
  var nextBtn = document.getElementById('post-search-next');
  var badge = document.getElementById('post-search-badge');
  var total = postSearchMatches.length;

  if (total === 0) {
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    if (badge) badge.textContent = '0/0';
    return;
  }

  if (prevBtn) prevBtn.disabled = false;
  if (nextBtn) nextBtn.disabled = false;
  if (badge) badge.textContent = (postSearchActiveIndex + 1) + '/' + total;
}

function postSearchKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.shiftKey ? prevMatch() : nextMatch();
  } else if (e.key === 'Escape') {
    togglePostSearch();
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

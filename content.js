// Coding Agent Communicator - Content Script
// 用于在页面上高亮元素、收集Comments信息

(function () {
  // 状态管理
  let isActive = false;
  let isPaused = false;
  let annotations = [];
  let currentElement = null;
  let highlightOverlay = null;
  let indicatorPanel = null;
  let currentDialog = null;
  let capturedErrors = [];
  let originalOnError = null;
  let originalConsoleError = null;

  // 检测是否在iframe中
  const isInIframe = window !== window.top;
  const isMainFrame = !isInIframe;

  // 存储iframe的偏移量（用于计算位置）
  let iframeOffset = { x: 0, y: 0 };

  // 获取iframe相对于主窗口的偏移量
  function getIframeOffset() {
    if (!isInIframe) return { x: 0, y: 0 };

    let x = 0;
    let y = 0;
    let currentFrame = window;
    let currentWindow = window;

    try {
      while (currentWindow !== window.top) {
        const frameElement = currentWindow.frameElement;
        if (!frameElement) break;

        const rect = frameElement.getBoundingClientRect();
        x += rect.left + frameElement.scrollLeft;
        y += rect.top + frameElement.scrollTop;

        // 获取父窗口的滚动偏移
        currentWindow = currentWindow.parent;
        if (currentWindow !== window.top) {
          x -= currentWindow.scrollX || 0;
          y -= currentWindow.scrollY || 0;
        }
      }
    } catch (e) {
      // 跨域iframe无法访问父窗口，使用相对位置
      console.log("跨域iframe，无法计算绝对位置");
    }

    return { x, y };
  }

  // 捕获控制台错误
  function startErrorCapture() {
    capturedErrors = [];

    // 捕获 window.onerror
    originalOnError = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      capturedErrors.push({
        message: typeof message === "string" ? message : String(message),
        source: source || "",
        lineno: lineno || 0,
        colno: colno || 0,
        error: error,
      });
      if (originalOnError) {
        return originalOnError.apply(this, arguments);
      }
    };

    // 捕获 console.error
    originalConsoleError = console.error;
    console.error = function (...args) {
      capturedErrors.push({
        message: args
          .map((arg) =>
            typeof arg === "string"
              ? arg
              : arg instanceof Error
                ? arg.message
                : typeof arg === "object"
                  ? JSON.stringify(arg)
                  : String(arg),
          )
          .join(" "),
        source: "console.error",
        lineno: 0,
        colno: 0,
      });
      originalConsoleError.apply(console, args);
    };

    // 捕获未处理的 Promise 错误
    window.addEventListener(
      "unhandledrejection",
      function handleRejection(event) {
        capturedErrors.push({
          message: event.reason?.message || String(event.reason),
          source: "unhandledrejection",
          lineno: 0,
          colno: 0,
        });
      },
    );
  }

  // 停止错误捕获
  function stopErrorCapture() {
    if (originalOnError) {
      window.onerror = originalOnError;
      originalOnError = null;
    }
    if (originalConsoleError) {
      console.error = originalConsoleError;
      originalConsoleError = null;
    }
    capturedErrors = [];
  }

  // 创建高亮覆盖层
  function createHighlightOverlay() {
    const overlay = document.createElement("div");
    // 在iframe中添加特殊标识
    overlay.id = isInIframe ? "cai-highlight-overlay-iframe" : "cai-highlight-overlay";
    overlay.style.cssText = `
      position: absolute;
      pointer-events: none;
      border: 2px solid #1a1a1a;
      background-color: rgba(26, 26, 26, 0.1);
      z-index: 2147483646;
      transition: all 0.1s ease;
      display: none;
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  // 创建元素标记
  function createElementMarker(annotation) {
    const marker = document.createElement("div");
    marker.className = "cai-element-marker";
    marker.setAttribute("data-annotation-index", annotation.index);
    marker.textContent = annotation.index;

    const rect = annotation.elementRect;
    const scrollLeft =
      window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    // 标记应该显示在主窗口中，所以需要使用绝对位置
    if (annotation.isInIframe && annotation.iframeOffset) {
      // 在iframe中创建标记，但位置是相对于iframe的
      marker.style.left = rect.right + 5 + "px";
      marker.style.top = rect.top + "px";
      // 在iframe中的标记
      marker.classList.add("cai-marker-in-iframe");
    } else {
      marker.style.left = rect.right + scrollLeft + 5 + "px";
      marker.style.top = rect.top + scrollTop + "px";
    }

    return marker;
  }

  // 面板拖动功能
  function setupPanelDrag(panel) {
    const header = panel.querySelector(".cai-panel-header");
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener("mousedown", (e) => {
      // 不拦截按钮点击
      if (e.target.closest("button")) return;

      isDragging = true;
      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      // 切换为 left/top 定位（移除 right）
      panel.style.left = rect.left + "px";
      panel.style.top = rect.top + "px";
      panel.style.right = "auto";
      panel.style.transformOrigin = "top left";

      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      // 边界限制
      const panelRect = panel.getBoundingClientRect();
      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panelRect.width));
      newTop = Math.max(0, Math.min(newTop, window.innerHeight - panelRect.height));

      panel.style.left = newLeft + "px";
      panel.style.top = newTop + "px";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  // 创建指示器面板
  function createIndicatorPanel() {
    const panel = document.createElement("div");
    panel.id = "cai-indicator-panel";
    panel.style.transform = "scale(0.8)";
    panel.style.transformOrigin = "top right";
    panel.innerHTML = `
      <div class="cai-panel-header">
        <span class="cai-panel-title">🎯 Coding Agent Communicator</span>
        <div class="cai-header-buttons">
          <button class="cai-header-btn" id="cai-pause-btn" title="暂停/恢复">⏸</button>
          <button class="cai-close-btn" id="cai-minimize-btn">−</button>
        </div>
      </div>
      <div class="cai-panel-content">
        <div class="cai-status">
          <span class="cai-status-dot active"></span>
          <span class="cai-status-text" id="cai-status-text">悬停在元素上点击添加Comments</span>
        </div>
        <div class="cai-options">
          <label class="cai-checkbox">
            <input type="checkbox" id="cai-include-errors" checked>
            <span>包含控制台报错信息</span>
          </label>
        </div>
        <div class="cai-annotations-list" id="cai-annotations-list">
          <div class="cai-empty-state">暂无Comments</div>
        </div>
        <div class="cai-actions">
          <button class="cai-btn cai-btn-secondary" id="cai-clear-btn">清空</button>
          <button class="cai-btn cai-btn-primary" id="cai-finish-btn">✓ 完成并复制</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // 绑定事件
    document
      .getElementById("cai-minimize-btn")
      .addEventListener("click", togglePanel);
    document
      .getElementById("cai-pause-btn")
      .addEventListener("click", togglePause);
    document
      .getElementById("cai-clear-btn")
      .addEventListener("click", clearAnnotations);
    document
      .getElementById("cai-finish-btn")
      .addEventListener("click", finishAndCopy);

    // 拖动功能
    setupPanelDrag(panel);

    return panel;
  }

  // 更新高亮位置
  function updateHighlight(element) {
    if (!element || !highlightOverlay) return;

    const rect = element.getBoundingClientRect();
    const scrollLeft =
      window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    // 更新iframe偏移量
    if (isInIframe) {
      iframeOffset = getIframeOffset();
    }

    highlightOverlay.style.display = "block";
    highlightOverlay.style.top = rect.top + scrollTop + "px";
    highlightOverlay.style.left = rect.left + scrollLeft + "px";
    highlightOverlay.style.width = rect.width + "px";
    highlightOverlay.style.height = rect.height + "px";

    // 更新标签文字
    const tagName = element.tagName.toLowerCase();
    let label = tagName;

    if (element.id) {
      label = `${tagName}#${element.id}`;
    } else if (element.className && typeof element.className === "string") {
      const classes = element.className
        .split(" ")
        .filter((c) => c.trim())
        .slice(0, 2);
      if (classes.length > 0) {
        label = `${tagName}.${classes.join(".")}`;
      }
    }

    // 如果在iframe中，添加iframe标识
    if (isInIframe) {
      label = `[iframe] ${label}`;
    }

    highlightOverlay.setAttribute("data-label", label);
  }

  // 生成 CSS 选择器
  function generateSelector(element) {
    if (element.id) {
      return "#" + element.id;
    }

    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += "#" + current.id;
        path.unshift(selector);
        break;
      }

      if (current.className && typeof current.className === "string") {
        const classes = current.className.split(" ").filter((c) => c.trim());
        if (classes.length > 0) {
          selector += "." + classes.join(".");
        }
      }

      // 添加 :nth-child 如果需要
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === current.tagName,
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);
      current = parent;
    }

    return path.join(" > ");
  }

  // 获取元素信息
  function getElementInfo(element) {
    const rect = element.getBoundingClientRect();
    const tagName = element.tagName.toLowerCase();

    // 获取元素的类名或ID
    let identifier = tagName;
    if (element.id) {
      identifier = `${tagName}#${element.id}`;
    } else if (element.className && typeof element.className === "string") {
      const classes = element.className
        .split(" ")
        .filter((c) => c.trim())
        .slice(0, 2);
      if (classes.length > 0) {
        identifier = `${tagName}.${classes.join(".")}`;
      }
    }

    // 获取元素文本（截断）
    let text = element.textContent?.trim() || "";
    if (text.length > 50) {
      text = text.substring(0, 47) + "...";
    }
    if (text) {
      identifier = `${tagName} "${text}"`;
    }

    // 如果在iframe中，添加iframe标识
    let absoluteX = Math.round(rect.left);
    let absoluteY = Math.round(rect.top);
    if (isInIframe) {
      iframeOffset = getIframeOffset();
      absoluteX = Math.round(rect.left + iframeOffset.x);
      absoluteY = Math.round(rect.top + iframeOffset.y);
      identifier = `[iframe] ${identifier}`;
    }

    return {
      tagName,
      identifier,
      selector: generateSelector(element),
      position: {
        x: absoluteX,
        y: absoluteY,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      isInIframe,
      iframeOffset: { ...iframeOffset },
    };
  }

  // 显示Comments输入对话框
  function showCommentDialog(elementInfo, element) {
    // 关闭之前的对话框
    if (currentDialog && currentDialog.parentElement) {
      currentDialog.remove();
    }
    currentDialog = null;

    return new Promise((resolve) => {
      const dialog = document.createElement("div");
      dialog.className = "cai-comment-dialog";
      dialog.style.transform = "scale(0.8)";
      dialog.style.transformOrigin = "top left";

      // 估算对话框高度（头部 + 信息 + textarea + 按钮 + padding）
      // 实际测量后调整：头部(60) + info(80) + textarea(100) + buttons(60) + padding(40) ≈ 340px
      const estimatedDialogHeight = 380;
      const estimatedDialogWidth = 500;
      const spacing = 15;

      // 计算相对于当前窗口的位置
      let relativeX, relativeY;

      if (isInIframe && element) {
        // 在iframe中，使用相对于元素的位置
        const rect = element.getBoundingClientRect();
        relativeX = rect.left;
        relativeY = rect.bottom;
      } else {
        // 在主窗口中
        relativeX = elementInfo.position.x;
        relativeY = elementInfo.position.y + elementInfo.position.height;
      }

      // 计算 x 位置：确保对话框不超出右边界
      let x = relativeX;
      if (x + estimatedDialogWidth > window.innerWidth - spacing) {
        x = window.innerWidth - estimatedDialogWidth - spacing;
      }
      if (x < spacing) {
        x = spacing;
      }

      // 计算 y 位置：优先在元素下方，如果不够空间则在上方
      const spaceBelow = window.innerHeight - relativeY;
      const spaceAbove = isInIframe && element
        ? element.getBoundingClientRect().top
        : elementInfo.position.y;

      let y;
      if (spaceBelow >= estimatedDialogHeight + spacing) {
        // 下方空间充足
        y = relativeY + spacing;
      } else if (spaceAbove >= estimatedDialogHeight + spacing) {
        // 下方不够，但上方充足
        y = (isInIframe && element ? element.getBoundingClientRect().top : elementInfo.position.y) - estimatedDialogHeight - spacing;
      } else {
        // 上下都不够，选择空间较大的一侧
        if (spaceBelow > spaceAbove) {
          // 下方空间更大，贴底显示
          y = Math.max(
            spacing,
            window.innerHeight - estimatedDialogHeight - spacing,
          );
        } else {
          // 上方空间更大，贴顶显示
          y = spacing;
        }
      }

      dialog.style.left = x + "px";
      dialog.style.top = y + "px";

      dialog.innerHTML = `
        <div class="cai-dialog-content">
          <div class="cai-dialog-header">
            <h3>添加Comments</h3>
          </div>
          <div class="cai-element-info">
            <div class="cai-info-row">
              <strong>元素:</strong> <code>${elementInfo.identifier}</code>
            </div>
            <div class="cai-info-row">
              <strong>位置:</strong> <code>${elementInfo.selector}</code>
            </div>
          </div>
          <textarea id="cai-comment-input" placeholder="输入你的Comments...（例如：颜色太深、对齐有问题等）" rows="3"></textarea>
          <div class="cai-dialog-actions">
            <button class="cai-btn cai-btn-secondary" id="cai-cancel-btn">取消</button>
            <button class="cai-btn cai-btn-primary" id="cai-save-btn">保存</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);
      currentDialog = dialog;

      const textarea = document.getElementById("cai-comment-input");
      const saveBtn = document.getElementById("cai-save-btn");
      const cancelBtn = document.getElementById("cai-cancel-btn");

      textarea.focus();
      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          resolve(textarea.value);
          dialog.remove();
          currentDialog = null;
        } else if (e.key === "Escape") {
          resolve(null);
          dialog.remove();
          currentDialog = null;
        }
      });

      saveBtn.addEventListener("click", () => {
        resolve(textarea.value);
        dialog.remove();
        currentDialog = null;
      });

      cancelBtn.addEventListener("click", () => {
        resolve(null);
        dialog.remove();
        currentDialog = null;
      });

      // 点击外部关闭
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) {
          resolve(null);
          dialog.remove();
          currentDialog = null;
        }
      });
    });
  }

  // 更新Comments列表
  function updateAnnotationsList() {
    const listContainer = document.getElementById("cai-annotations-list");
    if (!listContainer) return;

    if (annotations.length === 0) {
      listContainer.innerHTML =
        '<div class="cai-empty-state">暂无Comments</div>';
      return;
    }

    listContainer.innerHTML = annotations
      .map(
        (ann, index) => `
      <div class="cai-annotation-item">
        <div class="cai-annotation-number">${index + 1}</div>
        <div class="cai-annotation-content">
          <div class="cai-annotation-element">${ann.identifier}</div>
          <div class="cai-annotation-comment">${ann.comment || "(无Comments)"}</div>
        </div>
        <button class="cai-delete-btn" data-index="${index}">×</button>
      </div>
    `,
      )
      .join("");

    // 绑定删除按钮事件
    listContainer.querySelectorAll(".cai-delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const index = parseInt(e.target.dataset.index);
        const removed = annotations.splice(index, 1);

        // 删除对应的标记
        const marker = document.querySelector(
          `.cai-element-marker[data-annotation-index="${removed[0].index}"]`,
        );
        if (marker) {
          marker.remove();
        }

        // 重新编号
        annotations.forEach((ann, i) => {
          ann.index = i + 1;
          const marker = document.querySelector(
            `.cai-element-marker[data-annotation-index="${ann.index + 1}"]`,
          );
          if (marker) {
            marker.setAttribute("data-annotation-index", ann.index);
            marker.textContent = ann.index;
          }
        });

        updateAnnotationsList();
      });
    });
  }

  // 鼠标移动事件
  function handleMouseMove(e) {
    if (!isActive || isPaused) return;

    const element = e.target;
    const overlayId = isInIframe ? "cai-highlight-overlay-iframe" : "cai-highlight-overlay";

    // 忽略高亮层
    if (element.id === overlayId) {
      highlightOverlay.style.display = "none";
      return;
    }

    // 在主窗口中忽略面板上的元素
    if (isMainFrame) {
      if (element === indicatorPanel || indicatorPanel?.contains(element)) {
        highlightOverlay.style.display = "none";
        return;
      }
    }

    currentElement = element;
    updateHighlight(element);
  }

  // 鼠标点击事件
  function handleClick(e) {
    if (!isActive || isPaused) return;

    // 在主窗口中忽略点击在面板上的事件
    if (isMainFrame && e.target.closest("#cai-indicator-panel")) {
      return;
    }

    // 如果点击在对话框外的元素，关闭当前对话框
    if (currentDialog && !e.target.closest(".cai-comment-dialog")) {
      currentDialog.remove();
      currentDialog = null;
      return;
    }

    // 忽略点击在对话框上的事件
    if (e.target.closest(".cai-comment-dialog")) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const elementInfo = getElementInfo(e.target);

    showCommentDialog(elementInfo, e.target).then((comment) => {
      if (comment !== null && comment.trim() !== "") {
        const annotation = {
          ...elementInfo,
          comment: comment.trim(),
          timestamp: Date.now(),
          index: annotations.length + 1,
          element: e.target,
        };

        // 保存元素的矩形位置信息（用于定位标记）
        const rect = e.target.getBoundingClientRect();
        annotation.elementRect = {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };

        annotations.push(annotation);

        // 只在主窗口中更新注释列表
        if (isMainFrame) {
          updateAnnotationsList();
        }

        // 在元素上添加标记
        const marker = createElementMarker(annotation);
        document.body.appendChild(marker);
      }
    });
  }

  // 切换面板显示
  function togglePanel() {
    if (!indicatorPanel) return;
    indicatorPanel.classList.toggle("cai-minimized");
  }

  // 切换暂停状态
  function togglePause() {
    if (!indicatorPanel) return;

    isPaused = !isPaused;
    const pauseBtn = document.getElementById("cai-pause-btn");
    const statusText = document.getElementById("cai-status-text");

    if (isPaused) {
      pauseBtn.textContent = "▶";
      pauseBtn.title = "恢复";
      statusText.textContent = "已暂停 - 可以正常操作页面";
      document.body.style.cursor = "";
      if (highlightOverlay) {
        highlightOverlay.style.display = "none";
      }
      showNotification("⏸ 已暂停，可以正常操作页面");
    } else {
      pauseBtn.textContent = "⏸";
      pauseBtn.title = "暂停";
      statusText.textContent = "悬停在元素上点击添加Comments";
      document.body.style.cursor = "crosshair";
      showNotification("▶ 已恢复");
    }
  }

  // 清空所有Comments
  function clearAnnotations() {
    annotations = [];

    // 删除所有标记
    document.querySelectorAll(".cai-element-marker").forEach((marker) => {
      marker.remove();
    });

    updateAnnotationsList();
  }

  // 完成并复制到剪贴板
  function finishAndCopy() {
    // 只在主窗口中执行
    if (!isMainFrame) return;

    const viewport = `${window.innerWidth}×${window.innerHeight}`;
    const url = window.location.pathname;

    // 检查是否包含控制台错误
    const includeErrors =
      document.getElementById("cai-include-errors")?.checked ?? false;

    let output = `## Page Feedback: ${url}\n**Viewport:** ${viewport}\n\n`;

    // 添加控制台错误信息
    if (includeErrors && capturedErrors.length > 0) {
      output += `### 🚫 Console Errors (${capturedErrors.length})\n\n`;
      capturedErrors.forEach((err, index) => {
        output += `#### Error ${index + 1}\n`;
        output += `\`\`\`\n${err.message}\n\`\`\`\n`;
        if (err.source) {
          output += `**Source:** ${err.source}:${err.lineno}:${err.colno}\n`;
        }
        output += `\n`;
      });
      output += `---\n\n`;
    }

    if (annotations.length === 0) {
      output += "(暂无Comments)\n";
    } else {
      annotations.forEach((ann, index) => {
        output += `### ${index + 1}. ${ann.identifier}\n`;
        output += `**Location:** ${ann.selector}\n`;
        if (ann.isInIframe) {
          output += `**Source:** iframe\n`;
        }
        output += `**Comment:** ${ann.comment}\n\n`;
      });
    }

    // 复制到剪贴板
    navigator.clipboard
      .writeText(output)
      .then(() => {
        showNotification("✅ 已复制到剪贴板！");
      })
      .catch((err) => {
        // 降级方案
        const textarea = document.createElement("textarea");
        textarea.value = output;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        showNotification("✅ 已复制到剪贴板！");
      });
  }

  // 显示通知
  function showNotification(message) {
    const notification = document.createElement("div");
    notification.className = "cai-notification";
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add("cai-show");
    }, 10);

    setTimeout(() => {
      notification.classList.remove("cai-show");
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  // 启动工具
  function start() {
    if (isActive) return;

    isActive = true;

    // 先清理可能存在的旧元素
    const overlayId = isInIframe ? "cai-highlight-overlay-iframe" : "cai-highlight-overlay";
    const oldOverlay = document.getElementById(overlayId);
    if (oldOverlay) oldOverlay.remove();

    const oldPanel = document.getElementById("cai-indicator-panel");
    if (oldPanel) oldPanel.remove();

    highlightOverlay = createHighlightOverlay();

    // 只在主窗口中创建面板和开始错误捕获
    if (isMainFrame) {
      indicatorPanel = createIndicatorPanel();
      // 开始捕获控制台错误
      startErrorCapture();
    }

    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("click", handleClick, true);

    document.body.style.cursor = "crosshair";
    if (isMainFrame) {
      showNotification("🎯 Coding Agent Communicator 已启动");
    }
  }

  // 停止工具
  function stop() {
    if (!isActive) return;

    isActive = false;

    if (highlightOverlay) {
      highlightOverlay.remove();
      highlightOverlay = null;
    }

    // 只在主窗口中删除面板和停止错误捕获
    if (isMainFrame) {
      if (indicatorPanel) {
        indicatorPanel.remove();
        indicatorPanel = null;
      }
      // 停止捕获控制台错误
      stopErrorCapture();
    }

    // 删除所有数字标记
    document.querySelectorAll(".cai-element-marker").forEach((marker) => {
      marker.remove();
    });

    // 关闭可能打开的对话框
    if (currentDialog && currentDialog.parentElement) {
      currentDialog.remove();
      currentDialog = null;
    }

    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("click", handleClick, true);

    document.body.style.cursor = "";
    annotations = [];
  }

  // 监听来自 popup 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggle") {
      if (isActive) {
        stop();
        sendResponse({ status: "stopped" });
      } else {
        start();
        sendResponse({ status: "started" });
      }
    } else if (request.action === "getStatus") {
      sendResponse({ isActive });
    }
    return true;
  });

  // 页面加载时检查状态
  chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
    if (response && response.isActive) {
      start();
    }
  });
})();

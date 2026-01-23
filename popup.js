// Coding Agent Communicator - Popup Script

document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggle-btn");
  const copyBtn = document.getElementById("copy-btn");
  const statusIndicator = document.getElementById("status-indicator");
  const statusText = document.getElementById("status-text");
  const annotationCount = document.getElementById("annotation-count");

  let isActive = false;

  // 检查当前状态
  async function checkStatus() {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tab = tabs[0];

      if (!tab?.id) {
        updateUI(false);
        return;
      }

      // 检查是否是受限页面
      if (
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("edge://") ||
        tab.url.startsWith("about:")
      ) {
        updateUI(false);
        return;
      }

      const response = await chrome.tabs
        .sendMessage(tab.id, { action: "getStatus" })
        .catch(() => null);

      if (response?.isActive) {
        updateUI(true);
      } else {
        updateUI(false);
      }
    } catch (err) {
      updateUI(false);
    }
  }

  // 更新 UI
  function updateUI(active) {
    isActive = active;

    if (active) {
      toggleBtn.textContent = "⏹ 停止工具";
      statusIndicator.className = "status-indicator active";
      statusText.textContent = "已激活";
      copyBtn.classList.remove("hidden");
    } else {
      toggleBtn.textContent = "🚀 启动工具";
      statusIndicator.className = "status-indicator inactive";
      statusText.textContent = "未激活";
      copyBtn.classList.add("hidden");
      annotationCount.textContent = "0";
    }
  }

  // 切换工具状态
  toggleBtn.addEventListener("click", async () => {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tab = tabs[0];

      if (!tab?.id) {
        alert("无法获取当前标签页");
        return;
      }

      // 检查是否是受限页面
      if (
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("edge://") ||
        tab.url.startsWith("about:")
      ) {
        alert(
          "⚠️ 无法在此页面使用\n\n请在普通网页上使用此工具（不支持 chrome:// 等系统页面）",
        );
        return;
      }

      // 尝试发送消息
      const response = await chrome.tabs
        .sendMessage(tab.id, { action: "toggle" })
        .catch(() => null);

      if (response?.status === "started") {
        updateUI(true);
      } else if (response?.status === "stopped") {
        updateUI(false);
      } else {
        // Content script 未加载，尝试注入
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"],
          });

          // 注入成功，再次尝试切换
          const retryResponse = await chrome.tabs.sendMessage(tab.id, {
            action: "toggle",
          });
          updateUI(retryResponse?.status === "started");
        } catch (err) {
          console.error("注入失败:", err);
          alert("⚠️ 无法在此页面启动工具\n\n请尝试刷新页面后再次点击插件图标");
        }
      }
    } catch (err) {
      console.error("切换失败:", err);
      alert("⚠️ 操作失败\n\n" + err.message);
    }
  });

  // 复制按钮（这个按钮可能不太需要，因为复制已经在面板中实现了）
  copyBtn.addEventListener("click", () => {
    // 关闭 popup
    window.close();
  });

  // 初始化时检查状态
  checkStatus();
});

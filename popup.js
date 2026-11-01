// The switch for the site of the tab: on everywhere unless turned off for
// it; and what was done there.

const box = document.getElementById("on");
const hostLabel = document.getElementById("host");
const status = document.getElementById("status");

function showStatus(tabId) {
    chrome.tabs.sendMessage(tabId, "status", (reply) => {
        status.title = "";
        if (chrome.runtime.lastError || reply === undefined) {
            status.textContent = "Reload the page to apply it here.";
            return;
        }
        if (!reply.enabled) {
            status.textContent = "Turned off for this site.";
        } else if (reply.replaced.length === 0) {
            status.textContent =
                "On. No font here draws т as m; Bulgarian forms of other fonts are turned off.";
        } else {
            const count = reply.replaced.length;
            status.textContent = `${count} ${count === 1 ? "font" : "fonts"} replaced on this page.`;
            status.title = reply.replaced.join(", ");   // Their names, for who hovers
        }
    });
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    let host = "";
    try {
        const url = new URL(tab.url);
        if (url.protocol === "http:" || url.protocol === "https:") host = url.hostname;
    } catch {
        // No address to read
    }
    if (host === "") {
        hostLabel.textContent = "this page";
        box.disabled = true;
        status.textContent = "Works on web pages only.";
        return;
    }
    hostLabel.textContent = host;
    chrome.storage.sync.get({ off: [] }, ({ off }) => {
        box.checked = !off.includes(host);
        showStatus(tab.id);
    });
    box.addEventListener("change", () => {
        chrome.storage.sync.get({ off: [] }, ({ off }) => {
            const next = box.checked ? off.filter((h) => h !== host) : [...new Set([...off, host])];
            chrome.storage.sync.set({ off: next }, () => setTimeout(() => showStatus(tab.id), 300));
        });
    });
});

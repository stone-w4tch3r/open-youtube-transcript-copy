// --- SCRIPT INITIALIZATION AND GUARDS ---
// This ensures the script doesn't run multiple times on a single page,
// which can happen with YouTube's dynamic navigation.
(function() {
  if (window.hasTranscriptCopier) {
    return;
  }
  window.hasTranscriptCopier = true;

  console.log("YouTube Transcript Copier initializing...");

  // --- DEFAULT SETTINGS ---
  const defaultSettings = {
    includeTitle: true,
    includeUrl: true, // <--- Add this line
    includeTimestamps: true,
    useParagraphs: false,
  };

  // --- ROBUSTNESS VARIABLES ---
  let observer = null;
  let retryCount = 0;
  const MAX_RETRIES = 5; // Increased from 3
  let lastUrl = window.location.href;
  let isInjected = false;
  let injectionAttempts = 0;
  let urlChangeTimeout = null;

  // --- ADBLOCKER RESISTANCE STRATEGIES ---
  
  // Generate randomized class names to avoid detection
  function generateRandomClass() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Use randomized IDs and classes
  const randomContainerId = `yt-${generateRandomClass()}`;
  const randomButtonClass = `btn-${generateRandomClass()}`;
  const randomCopyBtnId = `copy-${generateRandomClass()}`;
  const randomSettingsBtnId = `settings-${generateRandomClass()}`;

  // --- ENHANCED URL CHANGE DETECTION ---
  function detectUrlChange() {
	  const currentUrl = window.location.href;
	  if (lastUrl !== currentUrl) {
		console.log("YouTube Transcript Copier: URL changed, cleaning up and reinitializing...");
		lastUrl = currentUrl;
		
		// Clean up existing button and observers
		const existingContainer = document.getElementById(randomContainerId);
		if (existingContainer) {
		  existingContainer.remove();
		}
		
		// Disconnect protection observer
		if (window.transcriptProtectionObserver) {
		  window.transcriptProtectionObserver.disconnect();
		  window.transcriptProtectionObserver = null;
		}
		
		// Reset state
		isInjected = false;
		retryCount = 0;
		injectionAttempts = 0;
		
		// Clear any existing timeout
		if (urlChangeTimeout) {
		  clearTimeout(urlChangeTimeout);
		}
		
		// Use progressive delays for better reliability
		urlChangeTimeout = setTimeout(() => {
		  initializeExtension();
		}, 1000); // Slightly increased delay
	  }
	}

  // --- BETTER TARGET DETECTION ---
  function findTargetContainer() {
    // Multiple selectors to try, combining Old and New UI injection points
    const selectors = [
      '#owner #subscribe-button',
      '#subscribe-button',
      'ytd-subscribe-button-renderer',
      '[aria-label*="Subscribe"]',
      '#owner .ytd-video-owner-renderer',
      '#owner',
      '#menu-container ytd-menu-renderer', // Old UI action menu fallback
      '#top-level-buttons-computed'        // Old UI like/dislike row fallback
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`YouTube Transcript Copier: Found target using selector: ${selector}`);
        return element;
      }
    }
    
    return null;
  }

  // --- WAIT FOR ELEMENT WITH TIMEOUT ---
  // --- WAIT FOR ELEMENT WITH TIMEOUT ---
  function waitForElement(selector, timeout = 4000) {
    return new Promise((resolve) => {
      const existingElement = document.querySelector(selector);
      if (existingElement) return resolve(existingElement);

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  async function scrapeTranscriptFromDOM() {
    console.log("[Transcript Debug] Starting DOM scrape fallback...");
    
    // 1. Expand the description if the button is hidden inside it
    const expander = document.querySelector('tp-yt-paper-button#expand, #expand-theme, #description-inline-expander');
    if (expander && expander.offsetParent !== null) {
      console.log("[Transcript Debug] Clicking description expander...");
      expander.click();
      await new Promise(r => setTimeout(r, 400));
    }

    // 2. Find and click the "Show transcript" button (Combined Old & New selectors)
    const buttonSelectors = [
      'button[aria-label*="show transcript" i]',
      'ytd-video-description-transcript-section-renderer button',
      '#primary-button button'
    ];
    
    let targetButton = null;
    for (const sel of buttonSelectors) {
      targetButton = document.querySelector(sel);
      if (targetButton && targetButton.offsetParent !== null) break;
    }

    if (targetButton) {
      console.log("[Transcript Debug] Found transcript button, clicking it...");
      targetButton.click();
    } else {
      console.error("[Transcript Debug] Could not find 'Show transcript' button.");
      return null;
    }

    console.log("[Transcript Debug] Waiting for transcript segments to load...");
    const segmentSelector = 'ytd-transcript-segment-renderer, transcript-segment-view-model';
    const found = await waitForElement(segmentSelector, 10000); 
    
    if (!found) {
      console.error(`[Transcript Debug] Timeout! '${segmentSelector}' never appeared.`);
      return null;
    }

    console.log("[Transcript Debug] Segments found. Beginning scroll-and-scrape...");

    const segmentsMap = new Map(); 
    
    // Find the actual scrollable window inside the panel
    const scrollContainer = document.querySelector('ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"] #content') 
                            || document.querySelector('ytd-engagement-panel-section-list-renderer[target-id*="transcript" i] #content')
                            || document.querySelector(segmentSelector).closest('#content, #contents');

    let unchangedCount = 0;
    let lastCount = 0;

    // 3. Loop to continuously scroll and scrape
    for (let i = 0; i < 150; i++) { 
        const currentSegments = document.querySelectorAll(segmentSelector);
        
        currentSegments.forEach(seg => {
            // Combined Old & New timestamp selectors
            let timestamp = seg.querySelector('.segment-timestamp, [class*="Timestamp"]')?.textContent?.trim() || "";
            
            let text = "";
            // Combined Old & New text formatting selectors
            const textSpan = seg.querySelector('.yt-core-attributed-string, .segment-text, yt-formatted-string');
            if (textSpan) {
                text = textSpan.textContent.trim();
            } else {
                // Fallback for transitional UIs
                const spans = Array.from(seg.querySelectorAll('span')).filter(s => 
                    !s.className.includes('Timestamp') && !s.className.includes('A11yLabel')
                );
                text = spans.map(s => s.textContent).join(' ').trim();
            }

            if (text) {
                segmentsMap.set(timestamp + text, { timestamp, text });
            }
        });

        // Trigger the scroll to load the next batch of DOM elements
        if (scrollContainer) {
            scrollContainer.scrollBy(0, 800);
        } else {
            currentSegments[currentSegments.length - 1].scrollIntoView({ block: 'end' });
        }

        await new Promise(r => setTimeout(r, 250)); 

        if (segmentsMap.size === lastCount) {
            unchangedCount++;
            if (unchangedCount >= 4) break; 
        } else {
            unchangedCount = 0;
        }
        lastCount = segmentsMap.size;
    }

    console.log(`[Transcript Debug] Scrape complete. Found ${segmentsMap.size} unique lines.`);

    // 4. Return formatted data
    return Array.from(segmentsMap.values()).map(data => {
        return {
            transcriptSegmentRenderer: {
                startTimeText: { simpleText: data.timestamp },
                snippet: { runs: [{ text: data.text }] }
            }
        };
    });
  }
  
  // --- ADBLOCKER-RESISTANT STYLING ---
  function createResistantStyles() {
    // Remove existing styles if they exist
    const existingStyle = document.getElementById('yt-transcript-styles');
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = document.createElement('style');
    style.id = 'yt-transcript-styles';
    style.textContent = `
      /* Use randomized selectors and avoid suspicious keywords */
      #${randomContainerId} {
        display: flex;
        margin-left: 8px;
        align-items: center;
        position: relative;
        z-index: 1;
      }
      
      .${randomButtonClass} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 36px;
        padding: 0 16px;
        font-size: 14px;
        font-weight: 500;
        font-family: "Roboto", "Arial", sans-serif;
        border: none;
        cursor: pointer;
        background-color: var(--yt-spec-brand-background-solid, rgb(36, 36, 36));
        color: var(--yt-spec-text-primary, #0f0f0f);
        transition: background-color .3s;
        outline: none;
        text-decoration: none;
        user-select: none;
      }
      
      .${randomButtonClass}:hover {
        background-color: var(--yt-spec-brand-background-secondary-hover, rgb(60, 60, 60));
      }
      
      #${randomCopyBtnId} {
        border-radius: 18px 0 0 18px;
        padding-right: 12px;
      }
      
      #${randomSettingsBtnId} {
        border-radius: 0 18px 18px 0;
        padding: 0 10px;
        border-left: 1px solid var(--yt-spec-10-percent-layer, #ccc);
      }
      
      #${randomSettingsBtnId} svg {
        width: 20px;
        height: 20px;
        filter: var(--yt-spec-icon-inactive);
      }
      
      /* Modal styles with randomized selectors */
      .modal-overlay-transcript {
        position: fixed;
        inset: 0;
        background-color: rgba(0, 0, 0, 0.6);
        z-index: 2500;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      
      .modal-content-transcript {
        background-color: var(--yt-spec-base-background, #fff);
        color: var(--yt-spec-text-primary, #0f0f0f);
        padding: 24px;
        border-radius: 12px;
        width: 90%;
        max-width: 450px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        font-family: "Roboto", "Arial", sans-serif;
      }
      
      .modal-content-transcript h2 {
        margin-top: 0;
        margin-bottom: 24px;
        font-size: 20px;
      }
      
      .setting-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        min-height: 24px;
      }
      
      .setting-item label {
        font-size: 16px;
        padding-right: 16px;
      }
      
      .custom-toggle {
        appearance: none;
        width: 40px;
        height: 20px;
        background-color: var(--yt-spec-brand-background-secondary-hover, #ccc);
        border-radius: 10px;
        position: relative;
        cursor: pointer;
        transition: background-color 0.2s ease-in-out;
      }
      
      .custom-toggle::before {
        content: '';
        position: absolute;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background-color: white;
        top: 2px;
        left: 2px;
        transition: transform 0.2s ease-in-out;
      }
      
      .custom-toggle:checked {
        background-color: #3ea6ff;
      }
      
      .custom-toggle:checked::before {
        transform: translateX(20px);
      }
    `;
    document.head.appendChild(style);
  }

  // --- CORE UI INJECTION WITH ENHANCED RELIABILITY ---
  async function injectButton() {
    injectionAttempts++;
    console.log(`YouTube Transcript Copier: Injection attempt ${injectionAttempts}`);

    // Check if our button is already on the page
    if (document.getElementById(randomContainerId)) {
      console.log("YouTube Transcript Copier: Button already exists");
      isInjected = true;
      return true;
    }

    // Wait for the target container to be available
    console.log("YouTube Transcript Copier: Waiting for target container...");
    const targetContainer = await waitForElement('#owner #subscribe-button', 8000);
    
    // If the element wasn't found by the specific selector, try the alternatives
    if (!targetContainer) {
      console.log("YouTube Transcript Copier: Target container not found, trying alternative selectors");
      const altTarget = findTargetContainer();
      if (!altTarget) {
        console.log("YouTube Transcript Copier: No suitable target found");
        return false;
      }
      return await injectIntoTarget(altTarget);
    }

    return await injectIntoTarget(targetContainer);
  }

  async function injectIntoTarget(targetContainer) {
    // Safety Guard: Ensure target and its parent exist before proceeding
    if (!targetContainer || !targetContainer.parentNode) {
      console.log("YouTube Transcript Copier: Target or parent missing, skipping injection");
      return false;
    }
    try {
      // Create styles first
      createResistantStyles();

      // Create the main container with randomized ID
      const container = document.createElement('div');
      container.id = randomContainerId;
      
      // Add attributes that make it look like a legitimate YouTube component
      container.setAttribute('data-yt-extension', 'transcript-copier');
      container.setAttribute('role', 'group');
      container.setAttribute('aria-label', 'Transcript tools');

      // --- Create the "Copy Transcript" part of the button ---
      const copyButton = document.createElement('button');
      copyButton.id = randomCopyBtnId;
      copyButton.className = randomButtonClass;
      copyButton.textContent = 'Transcript';
      copyButton.setAttribute('aria-label', 'Copy video transcript to clipboard');
      copyButton.setAttribute('type', 'button');
      copyButton.addEventListener('click', handleCopyClick);

      // --- Create the "Settings" gear part of the button ---
      const settingsButton = document.createElement('button');
      settingsButton.id = randomSettingsBtnId;
      settingsButton.className = randomButtonClass;
      settingsButton.title = 'Transcript Settings';
      settingsButton.setAttribute('aria-label', 'Open transcript settings');
      settingsButton.setAttribute('type', 'button');
      
      // Use inline SVG to avoid external resource blocking
      settingsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
        <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
      </svg>`;
      settingsButton.addEventListener('click', openSettingsModal);

      // Add both parts to the container
      container.appendChild(copyButton);
      container.appendChild(settingsButton);

      // Insert using multiple strategies for maximum resistance
      // Strategy 1: Normal insertion
      targetContainer.parentNode.insertBefore(container, targetContainer.nextSibling);
      
      // Strategy 2: Force visibility with important styles
      container.style.cssText = 'display: flex !important; visibility: visible !important; opacity: 1 !important; position: relative !important;';
      
      // Strategy 3: Add mutation observer to detect and counter removal
      if (window.transcriptProtectionObserver) {
		  window.transcriptProtectionObserver.disconnect();
		}

		// Strategy 3: Add mutation observer to detect removal (but don't auto-reinject to avoid duplicates)
		window.transcriptProtectionObserver = new MutationObserver((mutations) => {
		  mutations.forEach((mutation) => {
			if (mutation.type === 'childList') {
			  mutation.removedNodes.forEach((node) => {
				if (node === container || (node.contains && node.contains(container))) {
				  console.log("Transcript button removed, marking for re-injection on next check");
				  isInjected = false;
				}
			  });
			}
		  });
		});

		window.transcriptProtectionObserver.observe(targetContainer.parentNode, {
		  childList: true,
		  subtree: false  // Changed from true to false to reduce overhead
		});
      
      console.log("Transcript Copier: Button injected successfully with adblocker resistance.");
      isInjected = true;
      return true;
      
    } catch (error) {
      console.error("Failed to inject button:", error);
      return false;
    }
  }

  // --- STORAGE FALLBACK SYSTEM ---
	const STORAGE_KEY = 'yt-transcript-settings';

	// Make getSettings an async function for better control over async operations
	async function getSettings() {
	  // This helper function wraps the storage API call in a Promise with a timeout
	  // to prevent hanging if the API call doesn't respond or throws.
	  function getStoragePromise(api) {
		return new Promise(async (resolve, reject) => {
		  // Set a timeout to reject the promise if storage API doesn't respond
		  const timeoutId = setTimeout(() => reject(new Error("Storage operation timed out")), 500); // 500ms timeout

		  try {
			// Use the API's 'get' method. The callback 'result' will be the settings.
			api.get(defaultSettings, (result) => {
			  clearTimeout(timeoutId); // Clear timeout if callback is called
			  if (chrome.runtime.lastError) { // Check for errors reported by the browser API
				reject(chrome.runtime.lastError);
			  } else {
				resolve(result); // Resolve with the retrieved settings
			  }
			});
		  } catch (e) {
			clearTimeout(timeoutId);
			reject(e); // Catch any synchronous errors during the API call setup
		  }
		});
	  }

	  // 1. Try browser.storage.sync (or chrome.storage.sync for compatibility)
	  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
		try {
		  const storedSettings = await getStoragePromise(chrome.storage.sync);
		  // Merge with default settings to ensure all keys are present
		  return { ...defaultSettings, ...storedSettings };
		} catch (e) {
		  console.warn("YouTube Transcript Copier: Chrome storage error or timeout, falling back to localStorage:", e);
		  // Continue to localStorage fallback if chrome.storage fails
		}
	  }
	  
	  // 2. Fallback to localStorage
	  try {
		const stored = localStorage.getItem(STORAGE_KEY);
		const settings = stored ? JSON.parse(stored) : {}; // Parse to object, then merge
		return { ...defaultSettings, ...settings }; // Ensure defaults are merged
	  } catch (e) {
		console.warn("YouTube Transcript Copier: localStorage error, using default settings:", e);
		return defaultSettings; // Return default settings if localStorage also fails
	  }
	}

	// Function to set settings (similar robustness needed)
	function setSettings(settings) {
	  // 1. Try browser.storage.sync (or chrome.storage.sync)
	  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
		try {
		  chrome.storage.sync.set(settings, () => {
			if (chrome.runtime.lastError) {
			  console.warn("YouTube Transcript Copier: Error setting Chrome storage:", chrome.runtime.lastError);
			  // Fallback to localStorage if setting sync storage fails
			  try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
			  } catch (e) {
				console.warn("YouTube Transcript Copier: localStorage not available, settings will not persist:", e);
			  }
			}
		  });
		  return; // Exit if sync storage attempt is made
		} catch (e) {
		  console.warn("YouTube Transcript Copier: Error accessing Chrome storage for set, falling back to localStorage:", e);
		  // Continue to localStorage fallback
		}
	  }
	  
	  // 2. Fallback to localStorage
	  try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	  } catch (e) {
		console.warn("YouTube Transcript Copier: localStorage not available, settings will not persist:", e);
	  }
	}

  function openSettingsModal() {
    // Prevent multiple modals
    if (document.querySelector('.modal-overlay-transcript')) return;

    // Create overlay and modal elements
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay-transcript';

    const modal = document.createElement('div');
    modal.className = 'modal-content-transcript';

    modal.innerHTML = `
      <h2>Transcript Settings</h2>
      <div class="setting-item">
          <label for="includeTitle">Include video title</label>
          <input type="checkbox" id="includeTitle" class="custom-toggle">
      </div>
      <div class="setting-item">
          <label for="includeUrl">Include video URL</label>
          <input type="checkbox" id="includeUrl" class="custom-toggle">
      </div>
      <div class="setting-item">
          <label for="includeTimestamps">Include timestamps (line-by-line)</label>
          <input type="checkbox" id="includeTimestamps" class="custom-toggle">
      </div>
      <div class="setting-item">
          <label for="useParagraphs">Format as a single paragraph (no timestamps)</label>
          <input type="checkbox" id="useParagraphs" class="custom-toggle">
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Add listeners
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    
    modal.addEventListener('change', handleSettingsChange);

    // Load and display current settings
    loadAndApplySettings();
  }

  async function loadAndApplySettings() {
    try {
      const settings = await getSettings();
      // Use logical OR to fallback to default if undefined
      document.getElementById('includeTitle').checked = settings.includeTitle;
      document.getElementById('includeUrl').checked = (settings.includeUrl !== undefined) ? settings.includeUrl : defaultSettings.includeUrl;
      document.getElementById('includeTimestamps').checked = settings.includeTimestamps;
      document.getElementById('useParagraphs').checked = settings.useParagraphs;
    } catch (e) {
      console.warn("Failed to load settings:", e);
      // Apply default settings
      document.getElementById('includeTitle').checked = defaultSettings.includeTitle;
      document.getElementById('includeUrl').checked = defaultSettings.includeUrl;
      document.getElementById('includeTimestamps').checked = defaultSettings.includeTimestamps;
      document.getElementById('useParagraphs').checked = defaultSettings.useParagraphs;
    }
  }

  function handleSettingsChange(e) {
      const includeTitle = document.getElementById('includeTitle').checked;
      const includeUrl = document.getElementById('includeUrl').checked; // <--- Get new value
      let includeTimestamps = document.getElementById('includeTimestamps').checked;
      let useParagraphs = document.getElementById('useParagraphs').checked;

      // Logic for mutually exclusive options
      if (e.target.id === 'useParagraphs' && useParagraphs) {
          includeTimestamps = false;
          document.getElementById('includeTimestamps').checked = false;
      } else if (e.target.id === 'includeTimestamps' && includeTimestamps) {
          useParagraphs = false;
          document.getElementById('useParagraphs').checked = false;
      }

      const newSettings = { includeTitle, includeUrl, includeTimestamps, useParagraphs };
      setSettings(newSettings);
  }

  // --- MAIN COPY-TO-CLIPBOARD LOGIC ---
  async function handleCopyClick() {
    const copyButton = document.getElementById(randomCopyBtnId);
    const originalText = 'Transcript';
    
    // Immediately signal "Working" to the user
    copyButton.textContent = 'Fetching...';
    copyButton.disabled = true;

    try {
      // Fetch the transcript directly first
      const transcriptObj = await getTranscriptDict(window.location.href);
      if (!transcriptObj || !transcriptObj.transcript.length) {
        throw new Error("Transcript is empty or unavailable.");
      }

      copyButton.textContent = 'Formatting...';
      const settings = await getSettings();
      let formattedTranscript = '';

      if (settings.includeTitle) formattedTranscript += `Title: ${transcriptObj.title}\n`;
      if (settings.includeUrl) formattedTranscript += `URL: ${window.location.href.split('&t=')[0]}\n`;
      if (settings.includeTitle || settings.includeUrl) formattedTranscript += `\n`; 

      if (settings.useParagraphs) {
        formattedTranscript += transcriptObj.transcript.map(line => line[1]).join(' ');
      } else {
        formattedTranscript += transcriptObj.transcript.map(([timestamp, text]) => {
          return settings.includeTimestamps ? `(${timestamp}) ${text}` : text;
        }).join('\n');
      }
      
      // Use writeText to avoid the DOMException caused by rejected Promises in ClipboardItem
      await navigator.clipboard.writeText(formattedTranscript.trim());
      
      // Success UI
      copyButton.textContent = 'Copied!';

    } catch (err) {
      console.error("Transcript Copier Error:", err);
      copyButton.textContent = 'Error!';
      alert(`Could not get transcript: ${err.message}`);
    } finally {
      // Reset button
      setTimeout(() => {
        copyButton.textContent = originalText;
        copyButton.disabled = false;
      }, 2500);
    }
  }

  // --- ROBUST JSON EXTRACTOR ---
  function extractJsonVariable(content, variableName) {
      const prefix = `var ${variableName} =`;
      const startIndex = content.indexOf(prefix);
      if (startIndex === -1) return null;
      
      let braceStart = content.indexOf('{', startIndex);
      if (braceStart === -1) return null;
      
      let balance = 0;
      let inString = false;
      let escape = false;
      
      // Walk through characters to find the matching closing brace
      for (let i = braceStart; i < content.length; i++) {
        const char = content[i];
        
        if (escape) { escape = false; continue; }
        if (char === '\\') { escape = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        
        if (!inString) {
           if (char === '{') balance++;
           else if (char === '}') {
              balance--;
              if (balance === 0) {
                 try {
                    return JSON.parse(content.substring(braceStart, i + 1));
                 } catch (e) { return null; }
              }
           }
        }
      }
      return null;
  }

  // --- TRANSCRIPT FETCHING LOGIC (VIDEOS ONLY) ---
  async function getTranscriptDict(videoUrl) {
      // The try/catch was removed here so the actual error bubbles up to handleCopyClick
      const { title, ytData } = await resolveYouTubeData(videoUrl);
      const segments = await getTranscriptItems(ytData);
      
      if (!segments || !segments.length) {
          throw new Error("No transcript segments found.");
      }
      
      const transcript = segments.map(item => getSegmentData(item));
      return { title, transcript };
  }

  async function resolveYouTubeData(videoUrl) {
      console.log(`[Transcript Debug] Resolving data for URL: ${videoUrl}`);
      
      let ytData = window.ytInitialData;
      if (ytData) console.log("[Transcript Debug] Found ytInitialData in global window object.");
      
      if (!ytData) {
          console.log("[Transcript Debug] Global object missing, scanning script tags...");
          const scripts = document.getElementsByTagName('script');
          for (let script of scripts) {
              if (script.textContent.includes('var ytInitialData =')) {
                  ytData = extractJsonVariable(script.textContent, 'ytInitialData');
                  if (ytData) {
                      console.log("[Transcript Debug] Successfully extracted ytInitialData from script tag.");
                      break;
                  }
              }
          }
      }

      if (!ytData) {
          console.log("[Transcript Debug] Script tag scan failed, fetching raw HTML fallback...");
          try {
              const html = await fetch(videoUrl).then(res => res.text());
              ytData = extractJsonFromHtml(html, "ytInitialData");
              console.log(ytData ? "[Transcript Debug] HTML fetch succeeded." : "[Transcript Debug] HTML fetch returned null.");
          } catch (e) {
              console.warn("[Transcript Debug] Fetch fallback failed:", e);
          }
      }

      const domTitle = document.querySelector("#title h1")?.textContent?.trim() || 
                       document.querySelector("h1.ytd-watch-metadata")?.textContent?.trim();

      const title = domTitle || 
                    ytData?.videoDetails?.title || 
                    document.querySelector('meta[name="title"]')?.content || 
                    document.title.replace(" - YouTube", "") || 
                    "Unknown Title";
      
      console.log(`[Transcript Debug] Resolved Title: "${title}"`);
      return { title, ytData };
  }

  function getSegmentData(item) {
      const seg = item?.transcriptSegmentRenderer;
      if (!seg) return ["", ""];
      const timestamp = seg.startTimeText?.simpleText || "";
      const text = seg.snippet?.runs?.map(r => r.text).join("") || "";
      return [timestamp, text];
  }

  async function getTranscriptItems(ytData) {
    console.log("[Transcript Debug] Attempting to fetch transcript items...");
    
    // STRATEGY 1: Try the API first
    try {
      console.log("[Transcript Debug] Strategy 1: Attempting internal API fetch...");
      const stringified = JSON.stringify(ytData);
      const paramMatch = stringified.match(/"getTranscriptEndpoint":\s*{\s*"params":\s*"([^"]+)"/);
      const continuationParams = paramMatch ? paramMatch[1] : null;

      if (continuationParams) {
        console.log("[Transcript Debug] Found continuationParams:", continuationParams);
        
        const apiKey = document.documentElement.innerHTML.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
        const clientVersion = document.documentElement.innerHTML.match(/"clientVersion":"([^"]+)"/)?.[1] || "2.20260306.01.00";
        
        if (!apiKey) {
           console.warn("[Transcript Debug] Could not find INNERTUBE_API_KEY in document.");
        } else {
          console.log(`[Transcript Debug] Using dynamically found clientVersion: ${clientVersion}`);
          
          // Added hl, gl, and userAgent to prevent 400 Bad Request errors
          const body = { 
            context: { 
              client: { 
                clientName: "WEB", 
                clientVersion: clientVersion,
                hl: "en",
                gl: "US",
                userAgent: navigator.userAgent
              } 
            }, 
            params: continuationParams 
          };
          
          const res = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(body) 
          });
          
          if (!res.ok) {
             console.warn(`[Transcript Debug] API returned ${res.status} ${res.statusText}`);
          } else {
             const json = await res.json();
             const items = json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments;
             
             if (items && items.length > 0) {
               console.log(`[Transcript Debug] Strategy 1 Success: Retrieved ${items.length} items from API.`);
               return items;
             } else {
               console.warn("[Transcript Debug] API returned successful response, but no segments were found in the JSON.", json);
             }
          }
        }
      } else {
         console.warn("[Transcript Debug] getTranscriptEndpoint params not found in ytData.");
      }
    } catch (e) {
      console.warn("[Transcript Debug] API Strategy failed completely:", e);
    }

    console.log("[Transcript Debug] API Strategy failed or returned empty. Falling back to DOM Scrape.");
    
    // STRATEGY 2: Scrape the UI
    const domItems = await scrapeTranscriptFromDOM();
    if (domItems) return domItems;

    throw new Error("Transcript panel not available. Try opening the transcript manually, then click the button again.");
  }

  function extractJsonFromHtml(html, key) {
    const regexes = [
      new RegExp(`window\\["${key}"\\]\\s*=\\s*({[\\s\\S]+?})\\s*;`),
      new RegExp(`var ${key}\\s*=\\s*({[\\s\\S]+?})\\s*;`),
      new RegExp(`${key}\\s*=\\s*({[\\s\\S]+?})\\s*;`)
    ];
    
    for (const regex of regexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        try { return JSON.parse(match[1]); } catch (e) {}
      }
    }
    // Final check: look at global window (works if not in strict isolation)
    if (window[key]) return window[key];
    return null;
  }

  // --- ENHANCED OBSERVER LOGIC WITH AUTO-RECOVERY ---
  function setupObserver() {
	  // Disconnect existing observer if it exists
	  if (observer) {
		observer.disconnect();
	  }

	  let lastCheckTime = 0;
	  const CHECK_THROTTLE = 1000; // Only check once per second

	  observer = new MutationObserver((mutations) => {
		const now = Date.now();
		
		// Check for URL changes first (always do this)
		detectUrlChange();
		
		// Throttle the injection checks to prevent rapid-fire attempts
		if (now - lastCheckTime < CHECK_THROTTLE) {
		  return;
		}
		lastCheckTime = now;
		
		// Only try to inject if we haven't successfully injected yet
		if (!isInjected) {
		  // Check for any of our potential target containers
		  if (findTargetContainer()) {
			injectButton().then(success => {
			  if (success) {
				retryCount = 0;
			  }
			});
		  }
		}
		
		// Check if our button was removed (YouTube navigation can remove elements)
		if (isInjected && !document.getElementById(randomContainerId)) {
		  console.log("YouTube Transcript Copier: Button was removed, marking for re-injection");
		  isInjected = false;
		}
	  });

	  // Start observing with robust configuration
	  try {
		observer.observe(document.body, {
		  childList: true,
		  subtree: true,
		  attributes: false,
		  attributeOldValue: false,
		  characterData: false,
		  characterDataOldValue: false
		});
		console.log("YouTube Transcript Copier: Observer started successfully");
	  } catch (error) {
		console.error("YouTube Transcript Copier: Failed to start observer:", error);
		setTimeout(setupObserver, 2000);
	  }
	}

  // --- INITIALIZATION WITH PROGRESSIVE RETRY LOGIC ---
  async function initializeExtension() {
    console.log("YouTube Transcript Copier: Initializing extension...");
    
    const success = await injectButton();
    if (success) {
      console.log("YouTube Transcript Copier: Immediate injection successful");
      retryCount = 0;
    } else {
      console.log("YouTube Transcript Copier: Immediate injection failed, setting up observer and retry logic");
    }
    
    setupObserver();
    
    // Progressive retry with increasing delays
    const retryDelays = [2000, 4000, 6000, 8000, 10000];
    
    const retryInterval = setInterval(async () => {
      if (!isInjected && retryCount < MAX_RETRIES) {
        const delay = retryDelays[retryCount] || 10000;
        console.log(`YouTube Transcript Copier: Retry attempt ${retryCount + 1}/${MAX_RETRIES} (delay: ${delay}ms)`);
        
        const success = await injectButton();
        if (success) {
          clearInterval(retryInterval);
          retryCount = 0;
        } else {
          retryCount++;
        }
      } else if (retryCount >= MAX_RETRIES) {
        console.log("YouTube Transcript Copier: Max retries reached, will try again on next page change");
        clearInterval(retryInterval);
      } else if (isInjected) {
        clearInterval(retryInterval);
      }
    }, 2000);
  }

  // --- ENHANCED PAGE VISIBILITY HANDLING ---
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isInjected) {
      console.log("YouTube Transcript Copier: Page became visible, checking injection status");
      setTimeout(initializeExtension, 500);
    }
  });

  // --- PERIODIC HEALTH CHECK WITH ADBLOCKER DETECTION ---
  setInterval(() => {
    if (isInjected && !document.getElementById(randomContainerId)) {
      console.log("YouTube Transcript Copier: Health check failed (possible adblocker interference), reinitializing");
      isInjected = false;
      injectionAttempts = 0;
      initializeExtension();
    }
  }, 30000);

  // --- READY STATE HANDLING ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initializeExtension, 1200);
    });
  } else {
    setTimeout(initializeExtension, 1200);
  }

})();
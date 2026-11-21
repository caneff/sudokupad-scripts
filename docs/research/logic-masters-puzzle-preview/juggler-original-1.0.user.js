// ==UserScript==
// @name         Logic Masters Puzzle Preview
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Show puzzle preview images inline on Logic Masters portal pages
// @author       You
// @match        https://logic-masters.de/Raetselportal/*
// @exclude      https://logic-masters.de/Raetselportal/Raetsel/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Cache to store already fetched images to avoid duplicate requests
    const imageCache = new Map();

    // Function to fetch and parse HTML from a URL
    async function fetchHTML(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const html = await response.text();
            const parser = new DOMParser();
            return parser.parseFromString(html, 'text/html');
        } catch (error) {
            console.error('Error fetching HTML:', error);
            return null;
        }
    }

    // Function to find the first image with the specified pattern
    function findPuzzleImage(doc) {
        const images = doc.querySelectorAll('img');
        for (const img of images) {
            if (img.src && img.src.includes('bild.php')) {
                return img.src;
            }
        }
        return null;
    }

    // Function to create and insert preview image
    function insertPreviewImage(link, imageSrc) {
        // Check if preview already exists
        const existingPreview = link.parentElement.querySelector('.puzzle-preview');
        if (existingPreview) {
            return;
        }

        // Find the parent container (likely a table cell or div)
        const parentContainer = link.parentElement;

        // Create preview container
        const previewContainer = document.createElement('div');
        previewContainer.className = 'puzzle-preview';
        previewContainer.style.cssText = `
            float: left;
            margin-right: 10px;
            margin-bottom: 5px;
            max-width: 100px;
        `;

        // Create image element
        const img = document.createElement('img');
        img.src = imageSrc;
        img.style.cssText = `
            max-width: 100px;
            height: auto;
            display: block;
            border-radius: 2px;
        `;

        // Add loading indicator
        const loadingText = document.createElement('div');
        loadingText.textContent = 'Loading...';
        loadingText.style.cssText = `
            font-size: 10px;
            text-align: center;
            color: #666;
            font-style: italic;
        `;

        previewContainer.appendChild(loadingText);
        previewContainer.appendChild(img);

        // Insert preview at the beginning of the parent container
        parentContainer.insertBefore(previewContainer, parentContainer.firstChild);

        // Make sure the parent container can handle floating elements
        if (parentContainer.style.overflow !== 'hidden') {
            parentContainer.style.overflow = 'auto';
        }

        // Remove loading text when image loads
        img.onload = function() {
            loadingText.remove();
        };

        // Handle image load errors
        img.onerror = function() {
            loadingText.textContent = 'No preview';
            loadingText.style.color = '#999';
        };
    }

    // Function to process a single puzzle link
    async function processPuzzleLink(link) {
        const href = link.href;

        // Only process links that are actually puzzle pages
        if (!href.includes('zeigen.php')) {
            return;
        }

        console.log('Processing puzzle link:', href); // Debug log

        // Check cache first
        if (imageCache.has(href)) {
            const imageSrc = imageCache.get(href);
            if (imageSrc) {
                insertPreviewImage(link, imageSrc);
            }
            return;
        }

        // Fetch the puzzle page
        const doc = await fetchHTML(href);
        if (!doc) {
            imageCache.set(href, null); // Cache the failure
            return;
        }

        // Find the puzzle image
        const imageSrc = findPuzzleImage(doc);
        console.log('Found image:', imageSrc); // Debug log
        imageCache.set(href, imageSrc); // Cache the result (even if null)

        if (imageSrc) {
            insertPreviewImage(link, imageSrc);
        }
    }

    // Function to find and process all puzzle links
    function processAllPuzzleLinks() {
        const links = document.querySelectorAll('a[href*="zeigen.php"]');

        // Process links with a small delay to avoid overwhelming the server
        links.forEach((link, index) => {
            setTimeout(() => {
                processPuzzleLink(link);
            }, index * 200); // 200ms delay between each request
        });
    }

    // Function to observe for new content (in case the page loads content dynamically)
    function observeForNewContent() {
        const observer = new MutationObserver((mutations) => {
            let hasNewLinks = false;
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const newLinks = node.querySelectorAll ?
                                node.querySelectorAll('a[href*="zeigen.php"]') :
                                [];
                            if (newLinks.length > 0) {
                                hasNewLinks = true;
                            }
                        }
                    });
                }
            });

            if (hasNewLinks) {
                // Small delay to ensure DOM is settled
                setTimeout(processAllPuzzleLinks, 100);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Initialize the script
    function init() {
        // Process existing links when page loads
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', processAllPuzzleLinks);
        } else {
            processAllPuzzleLinks();
        }

        // Observe for dynamically loaded content
        observeForNewContent();
    }

    // Start the script
    init();
})();
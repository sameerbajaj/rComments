(() => {
    "use strict";

    // Global state
    const state = {
        modhash: "",
        isLoggedIn: false,
        prefersNightmode: false,
        usesNewStyles: !window.location.origin.includes("old.reddit.com"),
        prefersNewTab: false,
        cache: new Map() // maps comment URL path to cached data: { comments, currentListing, renderedHtml, startIndex }
    };

    // Helper to detect if the Reddit page is currently rendered in dark mode
    function isRedditDark() {
        if (document.documentElement.classList.contains("theme-dark") || 
            document.documentElement.classList.contains("dark") ||
            document.documentElement.getAttribute("theme") === "dark") {
            return true;
        }
        const body = document.querySelector("body");
        if (body && (body.classList.contains("theme-dark") || body.classList.contains("res-nightmode") || body.classList.contains("dark"))) {
            return true;
        }
        if (body) {
            const bg = window.getComputedStyle(body).backgroundColor;
            if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
                const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (match) {
                    const r = parseInt(match[1], 10);
                    const g = parseInt(match[2], 10);
                    const b = parseInt(match[3], 10);
                    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
                    return yiq < 128; // background is dark if YIQ is less than 128
                }
            }
        }
        return false;
    }

    // Initialize state
    function initState() {
        // Detect night mode dynamically
        state.prefersNightmode = isRedditDark();

        // Fetch user preferences and modhash
        fetch("/api/me.json")
            .then(res => {
                if (res.ok) return res.json();
                throw new Error();
            })
            .then(json => {
                if (json && json.data) {
                    state.modhash = json.data.modhash || "";
                    state.isLoggedIn = !!state.modhash;
                }
            })
            .catch(() => {
                // Ignore errors (user might not be logged in)
            });
            
        // Check new window preferences if config is available
        const config = document.querySelector("script[id='config']");
        if (config && /('|")new_window('|")\s?:\s?true/.test(config.innerHTML)) {
            state.prefersNewTab = true;
        }
    }

    // Helper to traverse up to find comments anchor
    function findCommentsLink(target) {
        if (!target) return null;
        let curr = target;
        for (let depth = 0; depth < 4 && curr; depth++) {
            if (curr.nodeName === "A") {
                const className = curr.className || "";
                const clickId = curr.getAttribute("data-click-id") || "";
                const matchesClass = className.includes("comments") || className.includes("search-comments") || clickId.includes("comments");
                const href = curr.href || "";
                const matchesHref = /\/r\/[^\/]+\/comments\//.test(href);
                if (matchesClass || matchesHref) {
                    return curr;
                }
            }
            curr = curr.parentElement;
        }
        return null;
    }

    // Popup controller
    const popupManager = {
        el: null,
        hideTimeout: null,

        create() {
            if (this.el) return this.el;

            const div = document.createElement("div");
            div.className = "_rcomment_div";
            if (state.usesNewStyles) div.classList.add("_rcomments_new_reddit_styles");
            div.style.display = "none";

            // Event delegation inside the popup
            div.addEventListener("click", (e) => {
                // Vote arrows
                if (e.target.classList.contains("arrow")) {
                    e.stopImmediatePropagation();
                    this.handleVote(e.target);
                    return false;
                }
                // Spoilers
                if (e.target.classList.contains("md-spoiler-text")) {
                    e.stopImmediatePropagation();
                    e.target.classList.add("revealed");
                    return false;
                }
                // Load More button
                if (e.target.classList.contains("_rcomments_next_comment")) {
                    e.stopImmediatePropagation();
                    this.handleLoadMore(e.target);
                    return false;
                }
            });

            // Prevent hiding when hovering inside popup
            div.addEventListener("mouseenter", () => {
                this.cancelHide();
            });
            div.addEventListener("mouseleave", () => {
                this.hideSoon();
            });

            document.body.appendChild(div);
            this.el = div;
            return div;
        },

        show(anchor, contentHtml) {
            const popup = this.create();
            popup.innerHTML = `<div class="_rcomments_content">${contentHtml}</div>`;
            
            state.prefersNightmode = isRedditDark();
            popup.classList.toggle("res-nightmode", state.prefersNightmode);
            popup.classList.toggle("_rcomments_dark", state.prefersNightmode);

            // Position popup below the anchor
            const rect = anchor.getBoundingClientRect();
            const top = window.pageYOffset + rect.bottom;
            const left = window.pageXOffset + rect.left;

            popup.style.top = top + "px";
            popup.style.left = left + "px";
            popup.style.display = "block";
        },

        hide() {
            if (this.el) {
                this.el.style.display = "none";
            }
        },

        hideSoon() {
            this.cancelHide();
            this.hideTimeout = setTimeout(() => {
                this.hide();
            }, 600);
        },

        cancelHide() {
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
        },

        showLoading(anchor) {
            const popup = this.create();
            popup.innerHTML = `<div class="_rcomments_loading _rcomments_comment comment thing"><span>Fetching comments...</span></div>`;
            
            state.prefersNightmode = isRedditDark();
            popup.classList.toggle("res-nightmode", state.prefersNightmode);
            popup.classList.toggle("_rcomments_dark", state.prefersNightmode);

            const rect = anchor.getBoundingClientRect();
            popup.style.top = (window.pageYOffset + rect.bottom) + "px";
            popup.style.left = (window.pageXOffset + rect.left) + "px";
            popup.style.display = "block";
        },

        showError(anchor, msg) {
            const popup = this.create();
            popup.innerHTML = `<div class="_rcomments_error">${msg}</div>`;
            
            state.prefersNightmode = isRedditDark();
            popup.classList.toggle("res-nightmode", state.prefersNightmode);
            popup.classList.toggle("_rcomments_dark", state.prefersNightmode);

            const rect = anchor.getBoundingClientRect();
            popup.style.top = (window.pageYOffset + rect.bottom) + "px";
            popup.style.left = (window.pageXOffset + rect.left) + "px";
            popup.style.display = "block";
        },

        handleVote(arrow) {
            if (!state.isLoggedIn || !state.modhash) return;

            const commentDiv = arrow.closest("._rcomments_comment");
            if (!commentDiv) return;

            const commentId = commentDiv.id;
            const arrowsContainer = arrow.parentElement;
            const upArrow = arrowsContainer.querySelector(".arrow.up, .arrow.upmod");
            const downArrow = arrowsContainer.querySelector(".arrow.down, .arrow.downmod");

            const isUpvote = arrow.classList.contains("up") || arrow.classList.contains("upmod");
            let direction = 0;

            if (isUpvote) {
                // If already upvoted, clear vote (0), else upvote (1)
                direction = arrow.classList.contains("upmod") ? 0 : 1;
            } else {
                // If already downvoted, clear vote (0), else downvote (-1)
                direction = arrow.classList.contains("downmod") ? 0 : -1;
            }

            // POST request to Reddit vote endpoint
            const formData = new URLSearchParams();
            formData.append("id", "t1_" + commentId);
            formData.append("dir", direction.toString());
            formData.append("uh", state.modhash);

            fetch("/api/vote/.json", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
                },
                body: formData
            }).catch(() => {
                // Ignore voting network failures
            });

            // Update UI classes
            arrowsContainer.classList.remove("likes", "dislikes", "unvoted");
            upArrow.classList.remove("up", "upmod");
            downArrow.classList.remove("down", "downmod");

            if (direction === 1) {
                arrowsContainer.classList.add("likes");
                upArrow.classList.add("upmod");
                downArrow.classList.add("down");
            } else if (direction === -1) {
                arrowsContainer.classList.add("dislikes");
                upArrow.classList.add("up");
                downArrow.classList.add("downmod");
            } else {
                arrowsContainer.classList.add("unvoted");
                upArrow.classList.add("up");
                downArrow.classList.add("down");
            }
        },

        handleLoadMore(button) {
            const startIdx = parseInt(button.getAttribute("data-start-index"), 10);
            const activeUrl = button.getAttribute("data-url");
            const cached = state.cache.get(activeUrl);

            if (!cached) return;

            const nextBatch = cached.comments.slice(startIdx, startIdx + 8);
            const nextHtml = nextBatch.map(c => renderComment(c, cached.currentListing)).join("");

            // Insert HTML right before the button
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = nextHtml;
            while (tempDiv.firstChild) {
                button.parentNode.insertBefore(tempDiv.firstChild, button);
            }

            const newStartIdx = startIdx + nextBatch.length;
            if (newStartIdx >= cached.comments.length) {
                // No more comments left
                const noMore = document.createElement("div");
                noMore.className = "_rcomments_next_comment_none";
                noMore.textContent = "No more comments";
                button.parentNode.replaceChild(noMore, button);
            } else {
                button.setAttribute("data-start-index", newStartIdx.toString());
            }

            // Update cache rendered HTML
            cached.startIndex = newStartIdx;
            cached.renderedHtml = this.el.querySelector("._rcomments_content").innerHTML;
        }
    };

    // Helper to render a comment and its replies recursively
    function renderComment(comment, currentListing) {
        if (!comment || comment.kind !== "t1") return "";
        const data = comment.data;
        if (!data || !data.id) return "";

        const isOP = currentListing && currentListing.author === data.author;
        let authorMods = isOP ? " submitter" : "";
        if (data.distinguished === "moderator") authorMods += " moderator _rcomments_mod";
        if (data.distinguished === "admin") authorMods += " admin";

        const stickiedTagline = data.stickied 
            ? '<span>&nbsp;·&nbsp;</span><span class="stickied-tagline _rcomments_stickied">stickied comment</span>' 
            : '';

        let scoreText = "";
        if (!data.stickied) {
            if (state.usesNewStyles) {
                scoreText = `<span class="score unvoted _rcomments_score">${data.score} points</span>`;
            } else {
                const diff = data.ups - data.downs;
                scoreText = `<span>
                    <span class="score dislikes">${diff - 1} points</span>
                    <span class="score unvoted">${diff} points</span>
                    <span class="score likes">${diff + 1} points</span>
                </span>`;
            }
        }

        let awardsHtml = "";
        if (data.all_awardings && data.all_awardings.length > 0) {
            const awardsList = data.all_awardings.map(award => {
                const iconUrl = state.usesNewStyles 
                    ? (award.resized_icons && award.resized_icons[0] ? award.resized_icons[0].url : "") 
                    : award.icon_url;
                if (!iconUrl) return "";
                const countText = state.usesNewStyles && award.count > 1 ? award.count : "";
                return `<span class="awarding-icon-container">
                    <img alt="award" class="awarding-icon" src="${iconUrl}" style="max-width:16px" />
                    <span class="_rcomments_awarding-count">${countText}</span>
                </span>`;
            }).filter(Boolean).slice(0, 4).join("");
            
            if (awardsList) {
                awardsHtml = `<span class="_rcomments_awards">${awardsList}</span>`;
            }
        }

        // Unescape body html safely
        let bodyHtml = "";
        if (data.body_html) {
            const txt = document.createElement("textarea");
            txt.innerHTML = data.body_html;
            bodyHtml = txt.value;
        }

        if (state.prefersNewTab) {
            bodyHtml = bodyHtml.replace(/(<a\s)(.*<\/a>)/g, '$1target="_blank" $2');
        }

        // Voting arrows
        let arrowsHtml = "";
        if (state.isLoggedIn && !state.usesNewStyles && !data.stickied) {
            let voteStateClass = "unvoted";
            if (data.likes === true) voteStateClass = "likes";
            else if (data.likes === false) voteStateClass = "dislikes";
            
            // Generate active/inactive arrows
            const upClass = data.likes === true ? "upmod" : "up";
            const downClass = data.likes === false ? "downmod" : "down";
            
            arrowsHtml = `<div class="_rcomments_arrows ${voteStateClass}">
                <div class="arrow ${upClass}"></div>
                <div class="arrow ${downClass}"></div>
            </div>`;
        }

        // Recursively render children
        let repliesHtml = "";
        if (data.replies && data.replies.data && data.replies.data.children) {
            data.replies.data.children.forEach(reply => {
                if (reply.kind === "t1") {
                    repliesHtml += renderComment(reply, currentListing);
                }
            });
        }

        return `
            <div id="${data.id}" class="_rcomments_comment comment thing">
                ${arrowsHtml}
                <div class="entry _rcomments_entry">
                    <div class="tagline _rcomments_tagline">
                        <a class="author${authorMods}" href="/user/${data.author}">${data.author}</a>
                        ${data.distinguished === "moderator" ? (state.usesNewStyles ? '&nbsp;<span class="_rcomments_mod">MOD</span>' : '[M]&nbsp;') : ''}
                        ${stickiedTagline}
                        ${scoreText}
                        ${awardsHtml}
                    </div>
                    <div class="_rcomments_body_html">${bodyHtml}</div>
                    <div class="children">${repliesHtml}</div>
                </div>
            </div>
        `;
    }

    // Main fetch controller
    let activeAnchor = null;
    let hoverTimeout = null;

    function handleMouseEnter(anchor) {
        if (activeAnchor === anchor) return;

        clearTimeout(hoverTimeout);
        activeAnchor = anchor;

        hoverTimeout = setTimeout(async () => {
            if (activeAnchor !== anchor) return;

            // Extract relative URL path
            let relativePath = "";
            try {
                const url = new URL(anchor.href);
                relativePath = url.pathname;
            } catch (err) {
                return;
            }
            if (!relativePath || relativePath === "/") return;

            popupManager.cancelHide();

            // Check if HTML is already cached
            const cached = state.cache.get(relativePath);
            if (cached) {
                popupManager.show(anchor, cached.renderedHtml);
                return;
            }

            popupManager.showLoading(anchor);

            // Fetch comments JSON
            // We set limit=25 and depth=4 to get a generous initial tree in 1 request
            const fetchUrl = `${relativePath}.json?sort=top&depth=4&limit=25`;

            try {
                const res = await fetch(fetchUrl);
                if (!res.ok) throw new Error("Network response error");
                const data = await res.json();

                if (activeAnchor !== anchor) return;

                const currentListing = data[0]?.data?.children[0]?.data || null;
                const allComments = data[1]?.data?.children || [];
                const comments = allComments.filter(c => c.kind === "t1" && c.data && c.data.author !== "AutoModerator");

                if (comments.length === 0) {
                    popupManager.show(anchor, '<div class="_rcomments_loading _rcomments_comment">No comments yet.</div>');
                    return;
                }

                // Render first batch of comments (8 comments)
                const firstBatch = comments.slice(0, 8);
                let contentHtml = firstBatch.map(c => renderComment(c, currentListing)).join("");

                // Add "Load More" controls if comments remain
                if (comments.length > 8) {
                    contentHtml += `<div class="_rcomments_next_comment" data-start-index="8" data-url="${relativePath}">↓ Load More Comments</div>`;
                } else {
                    contentHtml += `<div class="_rcomments_next_comment_none">No more comments</div>`;
                }

                // Cache the comment tree and listing info
                state.cache.set(relativePath, {
                    comments: comments,
                    currentListing: currentListing,
                    renderedHtml: contentHtml,
                    startIndex: 8
                });

                popupManager.show(anchor, contentHtml);

            } catch (err) {
                if (activeAnchor !== anchor) return;
                popupManager.showError(anchor, "Error: Could not retrieve comments from Reddit.");
            }

        }, 250); // 250ms Hover debounce
    }

    function handleMouseLeave() {
        clearTimeout(hoverTimeout);
        activeAnchor = null;
        popupManager.hideSoon();
    }

    // Initialize Event Listeners
    function init() {
        initState();

        // Mouse move listener on body to detect hovering comments link
        document.body.addEventListener("mousemove", (e) => {
            const commentsLink = findCommentsLink(e.target);

            if (commentsLink) {
                handleMouseEnter(commentsLink);
            } else if (activeAnchor) {
                // Check if moving to popup itself
                const insidePopup = e.target.closest("._rcomment_div");
                if (!insidePopup) {
                    handleMouseLeave();
                }
            }
        });

        // Global keydown listener for Escape
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                popupManager.hide();
            }
        });
    }

    // Kick off initialization
    init();

})();
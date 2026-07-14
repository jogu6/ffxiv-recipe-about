(function () {
  const topButton = document.querySelector('.top-button');
  const viewer = document.querySelector('.image-viewer');
  const stage = document.querySelector('.image-viewer-stage');
  const viewerImg = document.querySelector('.image-viewer-img');
  const closeButton = document.querySelector('.image-viewer-close');
  const licenseButton = document.querySelector('#licenseBtn');
  const licenseOverlay = document.querySelector('#licenseOverlay');
  const licenseCloseButton = document.querySelector('#licenseCloseBtn');
  let drag = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0
  };

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function updateTopButton() {
    if (!topButton) return;
    topButton.classList.toggle('visible', window.scrollY > 320);
  }

  function imageNeedsZoom(img) {
    const rect = img.getBoundingClientRect();
    return img.naturalWidth > Math.ceil(rect.width) + 1;
  }

  function getViewportFitHeight() {
    const viewportHeight = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight;
    const footerHeight = document.querySelector('.footer')?.getBoundingClientRect().height || 0;
    return Math.max(220, viewportHeight - footerHeight - 18);
  }

  function fitPostImagesToViewport() {
    const viewportFitHeight = getViewportFitHeight();
    document.querySelectorAll('.post').forEach(post => {
      const imageGrid = post.querySelector('.image-grid');
      if (!imageGrid) return;

      post.style.removeProperty('--post-image-max-height');

      const postHeight = post.getBoundingClientRect().height;
      const imageHeight = imageGrid.getBoundingClientRect().height;
      const nonImageHeight = Math.max(0, postHeight - imageHeight);
      const maxImageHeight = Math.floor(Math.max(96, viewportFitHeight - nonImageHeight - 2));
      post.style.setProperty('--post-image-max-height', `${maxImageHeight}px`);
    });
  }

  function getFrameDisplaySize(frame) {
    const img = frame.querySelector('img');
    if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
      return { width: 0, height: 0 };
    }

    const maxHeight = Number.parseFloat(getComputedStyle(img).maxHeight);
    const parentWidth = frame.closest('.post')?.clientWidth || img.naturalWidth;
    const maxWidth = Math.max(1, parentWidth);
    const scale = Math.min(
      1,
      maxWidth / img.naturalWidth,
      Number.isFinite(maxHeight) ? maxHeight / img.naturalHeight : 1
    );
    return {
      width: Math.ceil(img.naturalWidth * scale),
      height: Math.ceil(img.naturalHeight * scale)
    };
  }

  function fitGalleryHeights() {
    document.querySelectorAll('.image-grid.gallery-ready').forEach(gallery => {
      const frames = getGalleryFrames(gallery);
      const maxHeight = frames.reduce((height, frame) => {
        return Math.max(height, getFrameDisplaySize(frame).height);
      }, 0);
      if (maxHeight > 0) {
        gallery.style.setProperty('--gallery-viewport-height', `${maxHeight}px`);
      }
    });
  }

  function fitPostWidthsToWidest() {
    document.querySelectorAll('.post-list').forEach(postList => {
      const posts = Array.from(postList.querySelectorAll('.post'));
      if (posts.length === 0) return;

      postList.classList.remove('width-ready');
      postList.style.removeProperty('--post-unified-width');

      const maxWidth = posts.reduce((width, post) => {
        const style = getComputedStyle(post);
        const chromeWidth =
          Number.parseFloat(style.paddingLeft) +
          Number.parseFloat(style.paddingRight) +
          Number.parseFloat(style.borderLeftWidth) +
          Number.parseFloat(style.borderRightWidth);
        const contentWidth = Array.from(post.children).reduce((childWidth, child) => {
          if (child.classList.contains('image-grid') && child.classList.contains('gallery-ready')) {
            const frameWidth = getGalleryFrames(child).reduce((galleryWidth, frame) => {
              return Math.max(galleryWidth, getFrameDisplaySize(frame).width);
            }, 0);
            return Math.max(childWidth, frameWidth);
          }
          return Math.max(childWidth, Math.ceil(child.getBoundingClientRect().width));
        }, 0);
        return Math.max(width, Math.ceil(contentWidth + chromeWidth));
      }, 0);

      const availableWidth = postList.clientWidth;
      const unifiedWidth = Math.min(maxWidth, availableWidth);
      postList.style.setProperty('--post-unified-width', `${unifiedWidth}px`);
      document.documentElement.style.setProperty('--content-unified-width', `${unifiedWidth}px`);
      document.body.classList.add('layout-width-ready');
      postList.classList.add('width-ready');
    });
  }

  let layoutFrame = 0;
  function refreshImageLayout() {
    window.cancelAnimationFrame(layoutFrame);
    layoutFrame = window.requestAnimationFrame(() => {
      fitPostImagesToViewport();
      fitGalleryHeights();
      fitPostWidthsToWidest();
      fitPostImagesToViewport();
      fitGalleryHeights();
      updateZoomButtons();
    });
  }

  function updateZoomButtons() {
    document.querySelectorAll('.image-frame').forEach(frame => {
      const img = frame.querySelector('img');
      const button = frame.querySelector('.zoom-button');
      if (!img || !button) return;
      if (frame.hidden || getComputedStyle(frame).display === 'none') {
        frame.classList.remove('can-zoom');
        button.hidden = true;
        button.disabled = true;
        return;
      }
      if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
        frame.classList.remove('can-zoom');
        button.hidden = true;
        button.disabled = true;
        return;
      }
      const needsZoom = imageNeedsZoom(img);
      frame.classList.toggle('can-zoom', needsZoom);
      button.hidden = !needsZoom;
      button.disabled = !needsZoom;
    });
  }

  function getGalleryFrames(gallery) {
    return Array.from(gallery.querySelectorAll('.gallery-track > .image-frame'));
  }

  function updateGalleryState(gallery) {
    const frames = getGalleryFrames(gallery);
    if (frames.length <= 1) return;

    const track = gallery.querySelector('.gallery-track');
    const viewport = gallery.querySelector('.gallery-viewport');
    if (!track || !viewport) return;

    const frameWidth = Math.max(1, viewport.clientWidth);
    const index = Math.min(
      Math.max(Math.round(viewport.scrollLeft / frameWidth), 0),
      frames.length - 1
    );
    gallery.dataset.index = String(index);

    frames.forEach((frame, frameIndex) => {
      frame.classList.toggle('active', frameIndex === index);
      frame.hidden = false;
    });

    gallery.querySelectorAll('.gallery-dot').forEach((dot, dotIndex) => {
      dot.classList.toggle('active', dotIndex === index);
      dot.setAttribute('aria-current', dotIndex === index ? 'true' : 'false');
    });

    const prevButton = gallery.querySelector('.gallery-prev');
    const nextButton = gallery.querySelector('.gallery-next');
    if (prevButton) prevButton.disabled = index === 0;
    if (nextButton) nextButton.disabled = index === frames.length - 1;
    refreshImageLayout();
  }

  function scrollGalleryTo(gallery, index, behavior = 'smooth') {
    const frames = getGalleryFrames(gallery);
    const viewport = gallery.querySelector('.gallery-viewport');
    if (!viewport || frames.length <= 1) return;

    const nextIndex = Math.min(Math.max(index, 0), frames.length - 1);
    gallery.dataset.index = String(nextIndex);
    viewport.scrollTo({ left: viewport.clientWidth * nextIndex, behavior });
    window.setTimeout(() => updateGalleryState(gallery), behavior === 'smooth' ? 260 : 0);
  }

  function moveGallery(gallery, direction) {
    const current = Number.parseInt(gallery.dataset.index || '0', 10);
    scrollGalleryTo(gallery, current + direction);
  }

  function setupImageGalleries() {
    document.querySelectorAll('.image-grid').forEach(gallery => {
      const frames = Array.from(gallery.querySelectorAll(':scope > .image-frame'));
      if (frames.length <= 1 || gallery.classList.contains('gallery-ready')) return;

      gallery.classList.add('gallery-ready');
      gallery.dataset.index = '0';

      const viewport = createElement('div', 'gallery-viewport');
      const track = createElement('div', 'gallery-track');
      frames.forEach(frame => track.appendChild(frame));
      viewport.appendChild(track);
      gallery.appendChild(viewport);

      const prevButton = createElement('button', 'gallery-nav gallery-prev', '<');
      prevButton.type = 'button';
      prevButton.setAttribute('aria-label', '前の画像');

      const nextButton = createElement('button', 'gallery-nav gallery-next', '>');
      nextButton.type = 'button';
      nextButton.setAttribute('aria-label', '次の画像');

      const dots = createElement('div', 'gallery-dots');
      frames.forEach((_, index) => {
        const dot = createElement('button', 'gallery-dot');
        dot.type = 'button';
        dot.setAttribute('aria-label', `${index + 1}枚目の画像`);
        dot.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          scrollGalleryTo(gallery, index);
        });
        dots.appendChild(dot);
      });

      prevButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        moveGallery(gallery, -1);
      });
      nextButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        moveGallery(gallery, 1);
      });

      let scrollTimer = null;
      let dragPointerId = null;
      let dragStartX = 0;
      let dragStartScrollLeft = 0;
      let dragStartIndex = 0;
      let dragLastDeltaX = 0;
      let didDrag = false;

      viewport.addEventListener('scroll', () => {
        window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(() => updateGalleryState(gallery), 80);
      }, { passive: true });

      viewport.addEventListener('pointerdown', event => {
        if (event.target.closest('button')) return;
        event.preventDefault();
        dragPointerId = event.pointerId;
        dragStartX = event.clientX;
        dragStartScrollLeft = viewport.scrollLeft;
        dragStartIndex = Number.parseInt(gallery.dataset.index || '0', 10);
        dragLastDeltaX = 0;
        didDrag = false;
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add('dragging');
      });

      viewport.addEventListener('pointermove', event => {
        if (event.pointerId !== dragPointerId) return;
        const deltaX = event.clientX - dragStartX;
        if (Math.abs(deltaX) > 4) didDrag = true;
        dragLastDeltaX = deltaX;
        const minScrollLeft = viewport.clientWidth * Math.max(0, dragStartIndex - 1);
        const maxScrollLeft = viewport.clientWidth * Math.min(frames.length - 1, dragStartIndex + 1);
        viewport.scrollLeft = Math.min(Math.max(dragStartScrollLeft - deltaX, minScrollLeft), maxScrollLeft);
        event.preventDefault();
      });

      function finishDrag(event) {
        if (event.pointerId !== dragPointerId) return;
        dragPointerId = null;
        viewport.classList.remove('dragging');
        if (!didDrag) return;
        if (Math.abs(dragLastDeltaX) >= 24) {
          scrollGalleryTo(gallery, dragStartIndex + (dragLastDeltaX < 0 ? 1 : -1));
          return;
        }
        scrollGalleryTo(gallery, dragStartIndex);
      }

      viewport.addEventListener('pointerup', finishDrag);
      viewport.addEventListener('pointercancel', finishDrag);

      window.addEventListener('resize', () => {
        const current = Number.parseInt(gallery.dataset.index || '0', 10);
        scrollGalleryTo(gallery, current, 'auto');
      });

      gallery.appendChild(prevButton);
      gallery.appendChild(nextButton);
      gallery.appendChild(dots);
      scrollGalleryTo(gallery, 0, 'auto');
    });
  }

  function resetViewerPosition() {
    if (!stage) return;
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
  }

  function openViewer(img) {
    if (!viewer || !viewerImg || !img) return;
    viewerImg.src = img.currentSrc || img.src;
    viewerImg.alt = img.alt || '';
    viewer.classList.add('open');
    viewer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('viewer-open');
    window.requestAnimationFrame(resetViewerPosition);
  }

  function closeViewer() {
    if (!viewer || !viewerImg) return;
    viewer.classList.remove('open');
    viewer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('viewer-open');
    viewerImg.removeAttribute('src');
    drag.active = false;
    stage?.classList.remove('dragging');
  }

  function openLicense() {
    if (!licenseOverlay) return;
    licenseOverlay.classList.add('open');
    licenseOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('license-open');
  }

  function closeLicense() {
    if (!licenseOverlay) return;
    licenseOverlay.classList.remove('open');
    licenseOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('license-open');
  }

  setupImageGalleries();
  refreshImageLayout();

  document.querySelectorAll('.image-frame img').forEach(img => {
    if (img.complete) {
      refreshImageLayout();
    } else {
      img.addEventListener('load', refreshImageLayout, { once: true });
    }
  });

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(refreshImageLayout);
    document.querySelectorAll('.image-frame img').forEach(img => resizeObserver.observe(img));
  }

  window.addEventListener('load', refreshImageLayout);

  document.addEventListener('click', event => {
    const zoomButton = event.target.closest('.zoom-button');
    if (zoomButton) {
      const img = zoomButton.closest('.image-frame')?.querySelector('img');
      openViewer(img);
    }
  });

  stage?.addEventListener('pointerdown', event => {
    if (!viewer?.classList.contains('open')) return;
    drag.active = true;
    drag.pointerId = event.pointerId;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.scrollLeft = stage.scrollLeft;
    drag.scrollTop = stage.scrollTop;
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('dragging');
  });

  stage?.addEventListener('pointermove', event => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    stage.scrollLeft = drag.scrollLeft - deltaX;
    stage.scrollTop = drag.scrollTop - deltaY;
  });

  function endDrag(event) {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    drag.active = false;
    drag.pointerId = null;
    stage?.classList.remove('dragging');
  }

  stage?.addEventListener('pointerup', endDrag);
  stage?.addEventListener('pointercancel', endDrag);
  closeButton?.addEventListener('click', closeViewer);
  licenseButton?.addEventListener('click', openLicense);
  licenseCloseButton?.addEventListener('click', closeLicense);
  licenseOverlay?.addEventListener('click', event => {
    if (event.target === licenseOverlay) closeLicense();
  });
  topButton?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', updateTopButton, { passive: true });
  window.addEventListener('resize', refreshImageLayout);
  window.visualViewport?.addEventListener('resize', refreshImageLayout);
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (licenseOverlay?.classList.contains('open')) {
      closeLicense();
      return;
    }
    closeViewer();
  });

  updateTopButton();
  refreshImageLayout();
})();












function debounce (fn, delay = 500) {
  var timer;
  var pendingPromise;
  var context;
  var args;

  return function debouncedFn () {
    context = this;
    args = arguments;

    clearTimeout(timer);

    if (pendingPromise) {
      pendingPromise.resolve();
    }

    pendingPromise = {
      promise: new Promise(function (resolve, reject) {
        timer = setTimeout(function () {
          try {
            resolve(fn.apply(context, args));
          } catch (error) {
            reject(error);
          }
        }, delay);
      }),
      resolve: function () {
        clearTimeout(timer);

        pendingPromise = null;
      }
    };

    return pendingPromise.promise;
  };
}

function convertRating(imageRating) {
  const ratingRatio = 1 / 6;

  const conversion = Number(
    Math.round(imageRating % ratingRatio / ratingRatio) === 0 ?
    10 * (imageRating - (imageRating % ratingRatio)) :
    10 * (imageRating + (ratingRatio - imageRating % ratingRatio))
  );

  return Number(Number(conversion / 10).toFixed(2));
}

document.addEventListener('lazyloaded', function (e){
  if (e.target.getAttribute('src') === '') {
    return;
  }

  e.target.parentNode.classList.add('loaded');
});

class ImageGrid extends HTMLElement {
  constructor() {
    super();

    this.maxImageCount = 60;
    this.currentPage = 1;
    this.currentTags = [];
    
    this.gridItems = this.querySelectorAll('.grid-item');
    this.imagesData = [];

    document.addEventListener('imagegrid:params:changed', this.getImagesData.bind(this));
    document.addEventListener('imagegrid:images:loaded', this.onImagesLoaded.bind(this));
    document.addEventListener('page:changed', this.handlePageChange.bind(this));
    document.addEventListener('filter:tags:changed', this.handleFilterChange.bind(this));

    this.getImagesData();

    for (const item of this.gridItems) {
      item.addEventListener('click', function () {
        const itemImg = item.querySelector('img');
        document.dispatchEvent(new CustomEvent('modal:open', { detail: { imageSrc: itemImg.getAttribute('src'), imageRating: itemImg.dataset.rating, gridItem: item } }));
      });
    }
  }

  async getImagesData() {
    const currentUrl = new URL(window.location.href);
    const urlParams = currentUrl.searchParams;

    this.currentPage = urlParams.get('page') !== null ? Number(urlParams.get('page')) : 1;
    this.currentTags = urlParams.get('filters') !== null ? urlParams.get('filters').split(',') : [];

    const filtersQuery = this.currentTags.length > 0 ? `&filters=${ this.currentTags.join(',') }` : '';

    const images = await fetch(`/getimages?&page=${ this.currentPage }${ filtersQuery }`);

    if (images.status !== 200) {
      this.imagesData = [];
      return;
    }

    const response = await images.json();

    this.imagesData = response.images;

    document.dispatchEvent(new CustomEvent('imagegrid:images:loaded'));
    document.dispatchEvent(new CustomEvent('pagination:page:changed', { detail: { currentPage: this.currentPage, maxPages: response.max_page } }));
    document.dispatchEvent(new CustomEvent('jumpto:page:changed', { detail: { newPage: this.currentPage } }));
    document.dispatchEvent(new CustomEvent('jumpto:maximum:changed', { detail: { maxPages: response.max_page } }));
  }

  unloadCurrentImages() {
    for (const gridItem of this.gridItems) {
      const image = gridItem.querySelector('img');
      gridItem.classList.remove('loaded');

      setTimeout(function () {
        image.src = '';
        image.classList.add('lazyload');
      }, 200);
    }
  }

  scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  onImagesLoaded() {
    const imageData = this.imagesData;

    for (let i = 0; i < this.gridItems.length; i++) {
      const gridItem = this.gridItems[i];
      const imageElem = gridItem.querySelector('img');

      if (i >= imageData.length || typeof imageData[i] === 'undefined') {
        gridItem.classList.add('empty');
        continue;
      }
      
      const newImage = `/getimage?filename=${ imageData[i].image }`;
      const newRating = convertRating(imageData[i].rating);

      gridItem.classList.remove('empty');
      gridItem.classList.remove('loaded');

      imageElem.classList.add('transitioning');

      setTimeout(function () {
        imageElem.src = newImage
        imageElem.setAttribute('data-rating', newRating);
        imageElem.classList.add('lazyload');
      }, 200);

      setTimeout(function () {
        imageElem.classList.remove('transitioning');
      }, 400);
    }
  }

  handlePageChange(event) {
    this.currentPage = typeof event.detail.newPage !== 'undefined' ? event.detail.newPage : this.currentPage;
    this.currentTags = typeof event.detail.newTags !== 'undefined' ? event.detail.newTags : this.currentTags;

    this.unloadCurrentImages();
    this.scrollToTop();
    this.updateUrl();

    document.dispatchEvent(new CustomEvent('imagegrid:params:changed'));
  }

  handleFilterChange(event) {
    this.currentPage = 1;
    const action = event.detail.action;

    if (action === 'add') {
      this.currentTags.push(event.detail.tag);
    } else {
      this.currentTags.splice(this.currentTags.indexOf(event.detail.tag), 1);
    }

    this.unloadCurrentImages();
    this.scrollToTop();
    this.updateUrl();

    document.dispatchEvent(new CustomEvent('jumpto:page:changed', { detail: { newPage: 1 } }));
    document.dispatchEvent(new CustomEvent('imagegrid:params:changed'));
  }

  updateUrl() {
    const currentUrl = new URL(window.location.href);
    const urlParams = currentUrl.searchParams;

    urlParams.set('page', this.currentPage);
    this.currentTags.length > 0 ? urlParams.set('filters', this.currentTags.join(',')) : urlParams.delete('filters');

    window.history.pushState({}, '', `${ currentUrl.origin }${ currentUrl.pathname }?${ urlParams.toString() }`);
  }
}

window.customElements.define('image-grid', ImageGrid);

class PaginationNav extends HTMLElement {
  constructor() {
    super();

    this.currentPage = 1;
    this.maxPages = 1;

    document.addEventListener('pagination:page:changed', this.renderPaginationNav.bind(this));
  }

  addNavEventListeners() {
    const navLinks = this.querySelectorAll('a');

    for (const link of navLinks) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        const targetPage = e.target.innerText;

        if (targetPage.includes('Previous')) {
          this.currentPage = Number(this.currentPage) - 1;
        } else if (targetPage.includes('Next')) {
          this.currentPage = Number(this.currentPage) + 1;
        } else {
          this.currentPage = Number(targetPage);
        }

        document.dispatchEvent(new CustomEvent('jumpto:page:changed', { detail: { newPage: this.currentPage } }));
        document.dispatchEvent(new CustomEvent('page:changed', { detail: { newPage: this.currentPage } }));
      }.bind(this));
    }
  }

  renderPaginationNav(event) {
    this.currentPage = event.detail.currentPage;
    this.maxPages = event.detail.maxPages;

    const currentPage = this.currentPage;
    const maxPages = this.maxPages;

    const isNextNav = currentPage < maxPages;
    const isPrevNav = currentPage > 1;
    const navElem = document.createElement('nav');
    const neighbourPages = 2;

    let prevElem = null;
    let nextElem = null;
    let inbetweenElems = [];

    if (isPrevNav) {
      prevElem = document.createElement('a');
      prevElem.href = `?page=${ Number(currentPage) - 1 }`;
      prevElem.innerText = '< Previous';
      prevElem.classList.add('prev');
    }

    if (isNextNav) {
      nextElem = document.createElement('a');
      nextElem.href = `?page=${ Number(currentPage) + 1 }`;
      nextElem.innerText = 'Next >';
      nextElem.classList.add('next');
    }

    const lowerBound = currentPage - neighbourPages > 0 ? currentPage - neighbourPages : 1;
    const upperBound = currentPage + neighbourPages < maxPages ? currentPage + neighbourPages : maxPages;

    for (let i = lowerBound; i <= upperBound; i++) {
      const elem = document.createElement('a');
      elem.href = `?page=${ i }`;
      elem.innerText = i;

      if (i === currentPage) {
        elem.classList.add('active');
      }

      inbetweenElems.push(elem);
    }

    if (prevElem) {
      navElem.appendChild(prevElem);
    }

    for (const elem of inbetweenElems) {
      navElem.appendChild(elem);
    }

    if (nextElem) {
      navElem.appendChild(nextElem);
    }

    this.querySelector('.pagination-nav').innerHTML = navElem.innerHTML;
    this.addNavEventListeners();
  }
}

window.customElements.define('pagination-nav', PaginationNav);

class JumpToPage extends HTMLElement {
  constructor() {
    super();

    this.opener = this.querySelector('[data-action="open-controls"]');
    this.controls = this.querySelector('.jump-to-page__controls');
    this.input = this.querySelector('input');
    this.plus = this.querySelector('[data-action="add"]');
    this.minus = this.querySelector('[data-action="subtract"]');
    this.maxPages = 1;

    this.opener.addEventListener('click', this.toggleControls.bind(this));
    this.plus.addEventListener('click', this.incrementPage.bind(this));
    this.minus.addEventListener('click', this.decrementPage.bind(this));
    this.input.addEventListener('input', this.onInput.bind(this));

    document.addEventListener('jumpto:changed', debounce(function (event) { this.handlePageChange(event); }).bind(this));
    document.addEventListener('jumpto:maximum:changed', this.setMaximum.bind(this));
    document.addEventListener('jumpto:page:changed', this.setPage.bind(this));
  }

  setMaximum(event) {
    this.maxPages = event.detail.maxPages;

    this.input.setAttribute('max', this.maxPages);
  }

  toggleControls() {
    this.opener.classList.toggle('open');
    this.controls.classList.toggle('hidden');
  }

  incrementPage() {
    this.input.value = Number(this.input.value) + 1 > this.maxPages ? this.maxPages : Number(this.input.value) + 1;
    document.dispatchEvent(new CustomEvent('jumpto:changed', { detail: { instance: this } }));
  }

  decrementPage() {
    this.input.value = Number(this.input.value) > 1 ? Number(this.input.value) - 1 : 1;
    document.dispatchEvent(new CustomEvent('jumpto:changed', { detail: { instance: this } }));
  }

  onInput() {
    document.dispatchEvent(new CustomEvent('jumpto:changed', { detail: { instance: this } }));
  }

  handlePageChange(event) {
    if (event.detail.instance !== this) {
      return;
    }

    const newPage = Number(this.input.value) > 1 ? Number(this.input.value) : 1;
    
    document.dispatchEvent(new CustomEvent('page:changed', { detail: { newPage: newPage } }));
    document.dispatchEvent(new CustomEvent('jumpto:page:changed', { detail: { newPage: newPage } }));
  }

  setPage(event) {
    this.input.value = event.detail.newPage;
  }
}

window.customElements.define('jump-to-page', JumpToPage);

class ViewModal extends HTMLElement {
  constructor() {
    super();

    this.imageContainer = this.querySelector('.view-modal__image-container');
    this.image = this.imageContainer.querySelector('img');
    this.filenameContainer = this.querySelector('.view-modal__filename p');
    this.tagsContainer = this.querySelector('.view-modal__tags');
    this.ratingControls = this.querySelectorAll('input[type="radio"]');
    this.closeButton = this.querySelector('[data-action="close-modal"]');
    this.pageWrapper = document.querySelector('.page-wrapper');
    this.gridItem = null;

    this.closeButton.addEventListener('click', this.closeModal.bind(this));

    document.addEventListener('modal:open', this.openModal.bind(this));

    for (const ratingControl of this.ratingControls) {
      ratingControl.addEventListener('change', this.sendRatingChangedEvent.bind(this));
    }

    document.addEventListener('rating:changed', debounce(function (event) { this.handleRatingChange(event); }).bind(this));
  }

  openModal(event) {
    this.gridItem = event.detail.gridItem;

    const imageSrc = event.detail.imageSrc;
    const imageRating = Number(event.detail.imageRating) || 0;
    const convertedRating = convertRating(imageRating);

    for (const control of this.ratingControls) {
      if (control.value === convertedRating.toString()) {
        control.checked = true;
      } else {
        control.checked = false;
      }
    }

    this.image.src = imageSrc;

    const tempImg = new Image();
    tempImg.src = imageSrc;

    tempImg.onload = async function () {
      const filename = imageSrc.split('=')[1];
      const tags = await fetch('/gettags?filename=' + filename, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }).then(function (response) {
        return response.json();
      }).then(function (data) {
        return data.tags;
      });

      this.filenameContainer.innerText = filename;

      const UrlActiveTags = new URL(window.location.href).searchParams.get('filters') || '';
      const activeTags = UrlActiveTags.split(',');

      let tagsHtml = '';
      for (const tag of tags) {
        const tagElem = document.createElement('image-tag');
        const isActiveTag = activeTags.includes(tag);
        tagElem.innerText = tag;
        tagElem.classList.add('tag');

        if (isActiveTag) {
          tagElem.classList.add('active');
        }

        tagsHtml += tagElem.outerHTML;
      }

      this.tagsContainer.innerHTML = tagsHtml;

      this.pageWrapper.classList.add('blurred');
      document.documentElement.classList.add('overflow-hidden');
      this.classList.remove('hidden');
    }.bind(this);
  }

  closeModal() {
    this.pageWrapper.classList.remove('blurred');
    document.documentElement.classList.remove('overflow-hidden');
    this.classList.add('hidden');
  }

  sendRatingChangedEvent(event) {
    document.dispatchEvent(new CustomEvent('rating:changed', { detail: { rating: event.target.value } }));
  }

  handleRatingChange(event) {
    const rating = event.detail.rating;
    const filename = this.filenameContainer.innerText;

    fetch('/updaterating', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: filename,
        rating: rating
      })
    }).then(function (response) {
      return response.json();
    }).then(function (data) {
      if (data.success === true) {
        this.gridItem.querySelector('img').dataset.rating = rating;

        document.dispatchEvent(new CustomEvent('toast:show', { detail: { type: 'success', message: 'Rating updated' } }));
      } else {
        document.dispatchEvent(new CustomEvent('toast:show', { detail: { type: 'error', message: 'Rating update failed' } }));
      }
    }.bind(this));
  }
}

window.customElements.define('view-modal', ViewModal);

class ToastMessage extends HTMLElement {
  constructor() {
    super();

    this.messageContainer = this.querySelector('.content');
    this.type = this.dataset.type;

    document.addEventListener('toast:show', this.showToast.bind(this));
  }

  showToast(event) {
    if (this.type !== event.detail.type) {
      return;
    }

    const existingSameTypeMessage = document.querySelector(`toast-message[type="${ this.type }"].open`);

    if (existingSameTypeMessage !== null) {
      existingSameTypeMessage.classList.remove('open');
    }

    const message = event.detail.message;

    this.messageContainer.innerText = message;
    this.classList.add('open');

    setTimeout(function () {
      this.classList.remove('open');
    }.bind(this), 3000);
  }
}

window.customElements.define('toast-message', ToastMessage);

class ImageTag extends HTMLElement {
  constructor() {
    super();

    this.active = this.classList.contains('active');

    this.addEventListener('click', this.handleTagClick.bind(this));
  }

  handleTagClick() {
    const currentTag = this.innerText;

    if (this.active) {
      this.classList.remove('active');
      this.active = false;
      document.dispatchEvent(new CustomEvent('filter:tags:changed', { detail: { action: 'remove', tag: currentTag } }));
    } else {
      this.classList.add('active');
      this.active = true;
      document.dispatchEvent(new CustomEvent('filter:tags:changed', { detail: { action: 'add', tag: currentTag } }));
    }
  }
}

window.customElements.define('image-tag', ImageTag);
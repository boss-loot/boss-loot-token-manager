import { MODULE_NAME, NAMESPACE } from './constants.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export function tokenManager(resourceArray) {
  const normalizedResources = Object.assign({}, ...resourceArray);
  new TokenManager(normalizedResources).render(true);
}

class TokenManager extends HandlebarsApplicationMixin(ApplicationV2) {
  #originalTextureFlag = 'originalTexture';

  constructor(resources) {
    super();
    this.uiTitle = game.i18n.localize(`${MODULE_NAME}.ui.title`);
    this.resources = resources;
    this.selectedKey = null;
    this.selectedSrc = null;
  }

  static DEFAULT_OPTIONS = {
    id: MODULE_NAME,
    tag: 'form',
    window: {
      title: 'Default title',
      icon: 'bltm bltm-icon-tokenmanager',
      resizable: false,
      minimizable: false,
    },
    position: {
      width: 1000,
      height: 'auto',
    },
    classes: ['bltm'],
    form: {
      id: 'bltm-ui-app-window',
      closeOnSubmit: false,
      handler: TokenManager._onSubmit,
    },
  };

  /**
   * UI Title
   */
  get title() {
    return this.uiTitle;
  }

  /**
   * An array of [key, src] tuples.
   * Computed once on first access, then cached in _entries.
   */
  get entries() {
    if (!this._entries) {
      // Show only animated assets
      this._entries = Object.entries(this.resources).filter(([_, v]) => typeof v === 'string' && v.endsWith('.webm'));
    }
    return this._entries;
  }

  /** @override */
  static PARTS = Object.freeze({
    view: { template: `modules/${MODULE_NAME}/templates/bltm-view.hbs` },
    actor: { template: `modules/${MODULE_NAME}/templates/bltm-actor.hbs` },
    footer: { template: `modules/${MODULE_NAME}/templates/bltm-footer.hbs` },
  });

  /**
   * getData() from Application v1
   */
  async _prepareContext(options) {
    return {
      entries: this.entries.map(([key, src]) => ({ key, src })),
      selectedKey: this.selectedKey,
      selectedSrc: this.selectedSrc,
    };
  }

  /** Form submission handler */
  static async _onSubmit(event, form, formData) {
    const action = event?.submitter?.dataset?.action;
    const results = foundry.utils.expandObject(formData.object);

    if (action === 'rollback') {
      return this.rollbackActor(results);
    }

    // Default behavior for submit
    return this.updateActor(results);
  }

  /** Main render hooks */
  _onRender(context, options) {
    this.element.querySelector('.drop-area').addEventListener('drop', this.#onDrop.bind(this));
    this.element.querySelector('#bltm-search').addEventListener('input', this.#bindSearchHandler.bind(this));
    this.element.querySelector('#bltm-list').addEventListener('click', this.#onClickImage.bind(this));
  }

  /** Handle rendering selected image/video */
  #renderPreview(src) {
    const preview = this.element.querySelector('#bltm-preview-container');
    preview.innerHTML = '';
    const el = src.endsWith('.webm') ? document.createElement('video') : document.createElement('img');
    el.src = src;
    Object.assign(el.style, { maxWidth: '90%', maxHeight: '90%' });

    if (el.tagName === 'VIDEO') {
      Object.assign(el, { autoplay: true, loop: true, muted: true });
    } else {
      el.style.border = 'none';
    }

    preview.appendChild(el);
  }

  #onClickImage(event) {
    const el = event.target.closest('.bltm-image-key');
    if (!el) return;

    // Remove .selected from all previously selected elements
    const previouslySelected = this.element.querySelector('.bltm-image-key.selected');
    if (previouslySelected) {
      previouslySelected.classList.remove('selected');
    }

    // Add .selected to the clicked one
    el.classList.add('selected');

    this.selectedKey = el.dataset.key;
    this.selectedSrc = el.dataset.src;
    this.#renderPreview(this.selectedSrc);
    this.#updateFormFields();
  }

  /** Binds search input logic */
  #bindSearchHandler(event) {
    const query = event.currentTarget.value
      .trim()
      .toLowerCase()
      .replace(/[-[\]/{}()+?.\\^$|]/g, '\\$&')
      .replace(/\*/g, '.*');

    const regex = new RegExp(query);
    const filtered = this.entries.filter(([key]) => regex.test(key.toLowerCase()));
    const list = this.element.querySelector('#bltm-list');

    list.innerHTML = filtered
      .map(([key, value]) => `<div class="bltm-image-key" data-src="${value}" data-key="${key}">${key}</div>`)
      .join('');
  }

  /** Updates the hiddedn fields that keep the value of the selected image */
  #updateFormFields() {
    const keyField = this.element.querySelector('#bltm-selectedKey');
    const srcField = this.element.querySelector('#bltm-selectedSrc');
    if (keyField && srcField) {
      keyField.value = this.selectedKey;
      srcField.value = this.selectedSrc;
    }
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /**
   * Handle dropping actors onto the sheet.
   * @param {Event} event  Triggering drop event.
   */
  async #onDrop(event) {
    // Try to extract the data
    const data = TextEditor.getDragEventData(event);

    // Handle dropping linked items
    if (!data || data.type !== 'Actor') {
      ui.notifications.warn(game.i18n.localize(`${MODULE_NAME}.notifications.onDrop.actorNeeded`));
      return null;
    }

    const actor = await Actor.implementation.fromDropData(data);

    // Update hidden input and UI feedback
    const uuidInput = this.element.querySelector('#bltm-actor-uuid');
    if (uuidInput) uuidInput.value = actor.uuid;

    // Update UI elements
    const nameLabel = this.element.querySelector('#bltm-actor-name');
    const img = this.element.querySelector('#bltm-actor-img');
    const dropArea = this.element.querySelector('.drop-area');

    if (nameLabel) nameLabel.textContent = actor.name;
    if (img) img.src = actor.img || 'icons/svg/mystery-man.svg';
    if (dropArea) dropArea.innerText = `Linked: ${actor.name}`;
  }

  /* ----------------------------------------------- */
  /*  Methods that should be moved out of this class */
  /* ----------------------------------------------- */
  getTokenImages(imgPath) {
    if (!imgPath) return null;

    let staticArtPath = null;
    let animatedArtPath = null;

    if (imgPath.endsWith('.static')) {
      staticArtPath = this.resources[imgPath];
      const animatedKey = imgPath.replace('.static', '.animated');
      animatedArtPath = this.resources[animatedKey];
    } else if (imgPath.endsWith('.animated')) {
      animatedArtPath = this.resources[imgPath];
      const staticKey = imgPath.replace('.animated', '.static');
      staticArtPath = this.resources[staticKey];
    } else {
      const realFile = this.resources[imgPath];
      if (realFile.endsWith('.webp')) staticArtPath = realFile;
      if (realFile.endsWith('.webm')) animatedArtPath = realFile;
    }

    return { staticArtPath, animatedArtPath };
  }

  async updateActor(data) {
    const tokenArt = this.getTokenImages(data.selectedKey);

    if (!data.actor.uuid) {
      ui.notifications.warn(game.i18n.localize(`${MODULE_NAME}.notifications.updateActor.actorNeeded`));
      return null;
    }

    if (!tokenArt?.staticArtPath && !tokenArt?.animatedArtPath) {
      ui.notifications.warn(game.i18n.localize(`${MODULE_NAME}.notifications.updateActor.imageNeeded`));
      return null;
    }

    const actor = await fromUuid(data.actor.uuid);
    const updateData = {};

    if (tokenArt.staticArtPath) {
      updateData.img = tokenArt.staticArtPath;
      updateData['prototypeToken.texture.src'] = tokenArt.animatedArtPath || tokenArt.staticArtPath;
    } else {
      updateData['prototypeToken.texture.src'] = tokenArt.animatedArtPath;
    }

    // Backup
    const originalTexture = foundry.utils.getProperty(actor, `flags.${MODULE_NAME}.${this.#originalTextureFlag}`);
    if (!originalTexture) {
      actor.setFlag(MODULE_NAME, this.#originalTextureFlag, {
        tokenImg: actor.prototypeToken.texture.src,
        actorImg: actor.img,
      });
      console.log(`${NAMESPACE} | Saved original texture for '${actor.name}'`);
    }

    // await actor.update(foundry.utils.expandObject(updateData));
    await actor.update(updateData);

    // Update the actor image preview in the form
    const imgEl = this.element.querySelector('#bltm-actor-img');
    if (imgEl && actor && tokenArt.staticArtPath) {
      imgEl.src = tokenArt.staticArtPath;
    }

    ui.notifications.info(game.i18n.format(`${MODULE_NAME}.notifications.updateActor.success`, { actorName: actor.name }));
    return actor;
  }

  async rollbackActor(data) {
    if (!data.actor.uuid) {
      ui.notifications.warn(game.i18n.localize(`${MODULE_NAME}.notifications.rollbackActor.actorNeeded`));
      return null;
    }

    const actor = await fromUuid(data.actor.uuid);
    const originalTexture = foundry.utils.getProperty(actor, `flags.${MODULE_NAME}.${this.#originalTextureFlag}`);

    if (!originalTexture) {
      ui.notifications.warn(game.i18n.format(`${MODULE_NAME}.notifications.rollbackActor.imageNeeded`, { actorName: actor.name }));
      return null;
    }

    await actor.update({
      img: originalTexture.actorImg,
      'prototypeToken.texture.src': originalTexture.tokenImg,
    });

    // Remove the flag!
    await actor.unsetFlag(MODULE_NAME, this.#originalTextureFlag);

    // Update the actor image preview in the form
    const imgEl = this.element.querySelector('#bltm-actor-img');
    if (imgEl && actor) {
      imgEl.src = actor.img;
    }

    ui.notifications.info(game.i18n.format(`${MODULE_NAME}.notifications.rollbackActor.success`, { actorName: actor.name }));
    return actor;
  }
}

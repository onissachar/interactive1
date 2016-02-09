var Carbon;
(function (Carbon) {
    "use strict";
    var TabObserver = {
        active: false,
        start: function () {
            if (TabObserver.active)
                return;
            console.log('observing');
            TabObserver.active = true;
            document.addEventListener('keydown', TabObserver.onKeydown, true);
        },
        onKeydown: function (e) {
            if (e.keyCode != 9)
                return;
            var blockEl = $('.editing[autosave]');
            if (blockEl.lenght == 0)
                return;
            var nextEl = blockEl.next('.block');
            if (nextEl.length == 0)
                return;
            var currentBlock = EditBlock.get(blockEl);
            currentBlock.save();
            var nextBlock = Carbon.EditBlock.get(nextEl[0]);
            nextBlock.edit();
            e.preventDefault();
        },
        stop: function () {
            TabObserver.active = false;
            document.removeEventListener('keydown', TabObserver.onKeydown);
        }
    };
    var EditBlock = (function () {
        function EditBlock(element) {
            var _this = this;
            this.editing = false;
            this.reactive = new Carbon.Reactive();
            var el = $(element);
            if (el.length === 0)
                throw new Error("editBlock: element not found");
            if (el.data('controller'))
                throw new Error('editBlock: Already setup');
            this.element = el[0];
            this.name = this.element.getAttribute('name');
            var cancelButton = this.element.querySelector('.cancel');
            if (cancelButton) {
                $(cancelButton).on('click', this.cancel.bind(this));
            }
            el.on('click', this.edit.bind(this));
            this.form = new Form(this.element.querySelector('form'));
            this.form.on('submit', this.onSubmit.bind(this));
            var data = this.element.dataset;
            this.formatter = (data['formatter'])
                ? EditBlock.formatters[data['formatter']]
                : EditBlock.formatters.standard;
            this.element.classList.add('setup');
            this.autoSave = this.element.hasAttribute('autosave');
            console.log('apples');
            if (this.autoSave) {
                var inputEl = this.element.querySelector('input,textarea');
                inputEl.addEventListener('blur', function () {
                    console.log('blur');
                    if (_this.element.classList.contains('changed')) {
                        _this.save();
                    }
                });
            }
            this.textEl = this.element.querySelector('.text');
            el.data('controller', this);
        }
        EditBlock.get = function (el) {
            return $(el).data('controller') || new EditBlock(el);
        };
        EditBlock.prototype.on = function (name, callback) {
            if (callback === undefined) {
                $(this.element).on(name);
            }
            else {
                $(this.element).on(name, callback);
            }
        };
        EditBlock.prototype.off = function (name) {
            $(this.element).off(name);
        };
        EditBlock.prototype.edit = function (e) {
            if (this.element.matches('.editing, .disabled'))
                return;
            this.on('changed', this.onChanged.bind(this));
            if (e && e.target && e.target.matches('.action, .destroy, .handle')) {
                return;
            }
            this.editing = true;
            if (this.autoSave)
                TabObserver.start();
            Array.from(document.querySelectorAll('.editBlock.editing'))
                .forEach(function (el) { $(el).data('controller').close(); });
            this.element.classList.add('editing');
            var fieldSelected = false;
            this.takeSnapshot();
            for (var _i = 0, _a = this.form.fields; _i < _a.length; _i++) {
                var field = _a[_i];
                $(field.input.element).trigger('poke');
                if (!fieldSelected && field.autoSelect) {
                    field.select();
                    fieldSelected = true;
                }
            }
            $(this.element).trigger('editing', this);
        };
        EditBlock.prototype.observe = function (callback, options) {
            return this.reactive.subscribe(callback, options);
        };
        EditBlock.prototype.cancel = function (e) {
            this.revertToSnapshot();
            $(this.element).trigger('canceled');
            this.close(e, true);
        };
        EditBlock.prototype.close = function (e, canceled) {
            this.editing = false;
            this.element.classList.remove('editing');
            $(this.element).off('changed selection');
            if (this.autoSave)
                TabObserver.stop();
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (canceled) {
                this.element.classList.remove('changed');
            }
            var n = {
                type: 'closed',
                canceled: canceled,
                changed: this.element.classList.contains('changed')
            };
            $(this.element).trigger(n, this);
            this.reactive.trigger(n);
        };
        EditBlock.prototype.setValue = function (value) {
            var field = this.form.fields[0];
            field.setValue(value);
            this.setPreviewHtml(value);
        };
        EditBlock.prototype.setPreviewHtml = function (value) {
            if (value.empty()) {
                this.element.classList.remove('populated');
                this.element.classList.add('empty');
            }
            else {
                this.element.classList.remove('empty');
                this.element.classList.add('populated');
            }
            if (this.textEl) {
                this.textEl.innerHTML = value;
            }
        };
        EditBlock.prototype.onSubmit = function () {
            return this.save();
        };
        EditBlock.prototype.onChanged = function (e) {
            this.element.classList.add('changed');
            this.element.classList[!e.value ? 'add' : 'remove']('empty');
            this.reactive.trigger({
                type: 'input',
                name: e.name,
                value: e.value
            });
        };
        EditBlock.prototype.save = function () {
            var _this = this;
            if (this.form.status === 1)
                return;
            if (!this.element.classList.contains('changed')
                && !this.element.classList.contains('adding')) {
                this.close();
                return;
            }
            if (this.onSave) {
                var result = this.onSave();
                if (result === false)
                    return false;
                if (result === true)
                    return true;
            }
            if (this.form.element.classList.contains('passthrough'))
                return;
            this.element.classList.remove('changed');
            this.element.classList.add('saving');
            this.form.validate(function () {
                $(_this.element).trigger('saving', _this);
                var request = _this.form.send();
                _this.ajax = request;
                setTimeout(function () {
                    request.then(_this.onSaved.bind(_this), _this.onFail.bind(_this));
                }, 200);
            });
            return false;
        };
        EditBlock.prototype.onFail = function (xhr) {
            var _this = this;
            ['valid', 'invalid', 'saving'].forEach(function (name) {
                _this.element.classList.remove(name);
            });
        };
        EditBlock.prototype.onSaved = function (data, xhr) {
            var _this = this;
            ['invalid', 'saving', 'changed', 'new']
                .forEach(function (name) { _this.element.classList.remove(name); });
            this.element.classList.add('valid');
            this.element.classList.add('saved');
            var formatted = this.formatter.bind(this)(data);
            this.takeSnapshot();
            this.element.classList.remove('changed');
            var created = xhr && xhr.status === 201;
            if (created) {
                this.element.classList.remove('adding');
            }
            var n = {
                type: 'saved',
                data: data,
                created: created
            };
            this.reactive.trigger(n);
            $(this.element).trigger(n, data);
            formatted.then(function (text) {
                _this.setPreviewHtml(text);
                _this.close();
                $(_this.element).trigger('formatted');
            });
        };
        EditBlock.prototype.remove = function () {
            $(this.element).trigger('removing', this);
            this.dispose();
            this.element.remove();
            this.reactive.trigger({ type: 'removed' });
        };
        EditBlock.prototype.takeSnapshot = function () {
            this.form.fields.forEach(function (field) {
                field.savedValue = field.getValue();
            });
        };
        EditBlock.prototype.revertToSnapshot = function () {
            this.form.fields.forEach(function (field) {
                field.setValue(field.savedValue);
            });
        };
        EditBlock.prototype.dispose = function () {
            $(this.element).off();
            $(this.element).find("*").off();
        };
        EditBlock.formatters = {
            standard: function (response) {
                if (this.form.fields.length === 0) {
                    return Promise.resolve('');
                }
                var field = this.form.fields[0];
                return Promise.resolve(field.type === 'password' ? '••••••' : field.getValue());
            }
        };
        return EditBlock;
    })();
    Carbon.EditBlock = EditBlock;
    var Form = (function () {
        function Form(element) {
            var _this = this;
            this.status = 0;
            this.fields = [];
            this.focusInvalidField = true;
            this.validity = 0;
            var el = $(element);
            if (el.length === 0)
                throw new Error("Form element not found");
            this.element = el[0];
            this.element.setAttribute('novalidate', 'true');
            this.fields = $.map(this.element.querySelectorAll('carbon-field, .field'), function (el) { return new Field(el); });
            if (this.element.classList.contains('passthrough'))
                return;
            el.on('submit', this.onSubmit.bind(this));
            this.element.classList.add('setup');
            el.data('controller', this);
            if (this.element.dataset['validateMode'] === 'immediate') {
                this.fields.forEach(function (field) {
                    if (!field.validateMode) {
                        field.validateMode = 'immediate';
                    }
                });
                el.on('validated', 'carbon-field', function () {
                    var isValid = _this.fields.filter(function (f) { return !f.valid; }).length === 0;
                    _this.setValidity(isValid ? 1 : 2);
                });
            }
            el.triggerHandler('setup', this);
        }
        Form.get = function (el) {
            return $(el).data('controller') || new Form(el);
        };
        Object.defineProperty(Form.prototype, "name", {
            get: function () {
                return this.element.name;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Form.prototype, "valid", {
            get: function () {
                return this.validity = 1;
            },
            enumerable: true,
            configurable: true
        });
        Form.prototype.on = function (name, callback) {
            if (callback === undefined) {
                $(this.element).on(name);
            }
            else {
                $(this.element).on(name, callback);
            }
        };
        Form.prototype.off = function (name) {
            $(this.element).off(name);
        };
        Form.prototype.onSubmit = function (e) {
            var _this = this;
            e.preventDefault();
            if (this.status === 1)
                return;
            var isAjax = this.element.dataset['ajax'];
            var validate = this.element.dataset['validate'];
            if (validate === 'remote') {
                this.send();
                return;
            }
            this.validate(function () {
                if (!isAjax)
                    return;
                _this.send();
            });
        };
        Form.prototype.fillIn = function (data) {
            for (var key in data) {
                var value = data[key];
                var field = this.getField(key);
                if (field) {
                    field.setValue(value);
                }
            }
        };
        Form.prototype.validate = function (onSuccess, onError) {
            var _this = this;
            var d = new $.Deferred();
            this.element.classList.add('validating');
            var unvalidatedFields = this.fields.filter(function (f) { return !f.validated; });
            Promise.all(unvalidatedFields.map(function (f) { return f.validate(); }))
                .then(function () {
                _this.invalidFields = _this.fields.filter(function (f) { return !f.valid; });
                var valid = _this.invalidFields.length === 0;
                if (valid) {
                    _this.setValidity(1);
                    if (onSuccess) {
                        onSuccess();
                    }
                }
                else {
                    _this.setValidity(2);
                    if (!_this.focusInvalidField) {
                        _this.invalidFields[0].select();
                    }
                    if (onError) {
                        onError();
                    }
                }
                d.resolve();
                $(_this.element).triggerHandler({
                    type: 'validated',
                    validity: _this.validity,
                    valid: valid
                });
            });
            return d;
        };
        Form.prototype.setValidity = function (validity) {
            var _this = this;
            this.validity = validity;
            ['validated', 'validating', 'valid', 'invalid'].forEach(function (name) {
                _this.element.classList.remove(name);
            });
            if (validity === 1) {
                this.element.classList.add('validated');
                this.element.classList.add('valid');
            }
            else if (validity === 2) {
                this.element.classList.add('validated');
                this.element.classList.add('invalid');
            }
        };
        Form.prototype.send = function (onSuccess, onError) {
            var _this = this;
            if (this.status === 1)
                return;
            this.sendDate = new Date().getTime();
            this.status = 1;
            this.element.classList.add('sending');
            $(this.element).trigger('sending', this);
            var data, contentType;
            if (this.element.enctype === 'application/json') {
                contentType = 'application/json; charset=UTF-8';
                throw new Error('JSON encoding is not implemented');
            }
            else {
                contentType = 'application/x-www-form-urlencoded; charset=UTF-8';
                data = $(this.element).serialize();
            }
            this.ajax = $.ajax({
                method: this.element.getAttribute('method') || 'POST',
                url: this.element.action,
                contentType: contentType,
                data: data,
                dataType: 'json'
            });
            this.ajax.then(function (data, textStatus, xhr) {
                _this.onSent(data);
                if (onSuccess) {
                    onSuccess(data, xhr);
                }
            });
            this.ajax.fail(function (xhr) {
                _this.onFail(xhr);
                if (onError) {
                    onError(xhr);
                }
            });
            console.log('send', this.ajax);
            return this.ajax;
        };
        Form.prototype.onFail = function (xhr) {
            this.status = 5;
            var elapsed = new Date().getTime() - this.sendDate;
            this.element.classList.remove('sending');
            var response = JSON.parse(xhr.responseText);
            var errors = response.errors;
            if (errors) {
                for (var _i = 0; _i < errors.length; _i++) {
                    var error = errors[_i];
                    if (error.key) {
                        var field = this.getField(error.key);
                        if (field) {
                            field.errors = [];
                            field.addError(error);
                            field.setState('invalid');
                        }
                    }
                    else {
                        this.setError(error);
                    }
                }
                this.invalidFields = this.fields.filter(function (f) { return !f.valid; });
                var valid = this.invalidFields.length === 0;
                this.setValidity(valid ? 1 : 2);
                if (this.invalidFields.length > 0) {
                    this.invalidFields[0].select();
                }
            }
            $(this.element).triggerHandler('fail');
        };
        Form.prototype.setError = function (error) {
            this.element.classList.add('ctx');
            var errorEl = this.element.querySelector('.error');
            if (errorEl) {
                var messageEl = errorEl.querySelector('.message');
                if (messageEl) {
                    messageEl.innerHTML = error.message;
                }
                if (error.description) {
                    errorEl.classList.add('hasDescription');
                    var descriptionEl = errorEl.querySelector('.description');
                    descriptionEl.innerHTML = error.description;
                }
            }
            $(this.element).triggerHandler('error', error);
        };
        Form.prototype.getField = function (name) {
            var slug = name.toLowerCase();
            var matches = this.fields.filter(function (f) { return f.slug === slug; });
            if (matches.length === 0)
                return null;
            return matches[0];
        };
        Form.prototype.onSent = function (data) {
            this.status = 2;
            if (data.redirect) {
                window.location = data.redirect.url;
                return;
            }
            this.element.classList.remove('sending');
            this.element.classList.remove('error');
            this.element.classList.add('sent');
            var e = {
                type: 'sent',
                response: data,
                target: this.element
            };
            $(this.element).trigger(e, data);
            if (!Carbon.ActionKit)
                return;
            Carbon.ActionKit.dispatch(e);
        };
        Form.prototype.invalidate = function (clear) {
            var _this = this;
            this.setValidity(0);
            ['error', 'sending', 'sent', 'saved'].forEach(function (name) {
                _this.element.classList.remove(name);
            });
            for (var _i = 0, _a = this.fields; _i < _a.length; _i++) {
                var field = _a[_i];
                if (clear) {
                    field.setValue('');
                }
                field.setValidity(0);
            }
            ;
            this.invalidFields = [];
        };
        Form.prototype.reset = function (clear) {
            this.invalidate(clear);
        };
        Form.prototype.dispose = function () {
            var el = $(this.element);
            el.removeData('controller');
            el.off();
            el.find('*').off();
            el.removeClass('setup');
        };
        return Form;
    })();
    Carbon.Form = Form;
    var Field = (function () {
        function Field(element) {
            var _this = this;
            this.validated = false;
            this.validating = false;
            this.validators = [];
            this.restrictions = [];
            this.errors = [];
            this.validity = 0;
            var el = $(element);
            this.element = el[0];
            this.name = this.element.getAttribute('name') || this.element.dataset['name'];
            this.autoSelect = this.element.classList.contains('autoSelect');
            this.messageEl = this.element.querySelector('.message');
            var inputEl = this.element.querySelector('input');
            if (inputEl) {
                this.input = (inputEl.type === 'checkbox')
                    ? new HtmlCheckbox(inputEl)
                    : new HtmlInput(inputEl);
            }
            else if ((inputEl = this.element.querySelector('textarea'))) {
                this.input = new HtmlInput(inputEl);
            }
            else if ((inputEl = this.element.querySelector('select'))) {
                this.input = new HtmlSelect(inputEl);
            }
            else {
                throw new Error('Input element not found');
            }
            this.type = this.input.type;
            this.autoFocus = this.input.autofocus;
            this.minLength = this.input.minLength || 0;
            this.maxLength = this.input.maxLength || 100000;
            this.required = this.input.required;
            this.validateMode = this.element.dataset['validateMode'];
            if (!this.name)
                this.name = this.input.name;
            if (this.autoFocus && this.input.active) {
                this.element.classList.add('focused');
            }
            $(this.input.element).on({
                blur: this.onBlur.bind(this),
                focus: this.onFocus.bind(this),
                input: this.onChanged.bind(this),
                keypress: this.onKeyPress.bind(this)
            });
            if (this.input.supportsChange) {
                $(this.input.element).on('change', this.onChanged.bind(this));
            }
            if (this.getValue()) {
                this.element.classList.remove('empty');
            }
            else {
                this.element.classList.add('empty');
            }
            this.validateRemote = this.input.validateRemote;
            this.validateFrequency = this.input.validateFrequency;
            if (this.input.restrict) {
                switch (this.input.restrict) {
                    case 'number':
                        this.restrictions.push(InputRestriction.Number);
                        break;
                    case 'tag':
                        this.restrictions.push(InputRestriction.Tag);
                        break;
                }
            }
            if (this.validateRemote) {
                this.validators.push(new RemoteValidator(this.validateRemote));
            }
            switch (this.type) {
                case 'email':
                    this.validators.push(new EmailAddressValidator());
                    break;
                case 'url':
                    this.validators.push(new UrlValidator(this.input.autoCorrect));
                    break;
                case 'creditcardnumber':
                    this.validators.push(new CreditCardNumberValidator());
                    break;
            }
            if (this.minLength > 0) {
                this.validators.push(new StringLengthValidator(this.minLength, this.maxLength));
            }
            this.slug = (this.name) ? this.name.toLowerCase() : null;
            if (this.required) {
                this.element.classList.add('required');
            }
            if (this.element.querySelector('.suggestions')) {
                this.autoComplete = new AutoComplete(this.element);
            }
            el.data({
                controller: this
            });
            if (el.data('countdownCharacters')) {
                var charactersLeftEl = this.element.querySelector('.charactersLeft');
                if (charactersLeftEl) {
                    var left = this.maxLength - this.getValue().length;
                    charactersLeftEl.textContent = left.toString();
                    $(this.input.element).on('input', function () {
                        var left = _this.maxLength - _this.getValue().length;
                        charactersLeftEl.textContent = left.toString();
                    });
                }
            }
            if (this.getValue()) {
                this.validate();
            }
            el.trigger('setup', this);
        }
        Field.prototype.onKeyPress = function (e) {
            for (var _i = 0, _a = this.restrictions; _i < _a.length; _i++) {
                var restriction = _a[_i];
                var result = restriction(e);
                if (result) {
                    e.preventDefault();
                    return;
                }
            }
        };
        Field.prototype.focus = function () {
            this.input.focus();
        };
        Field.prototype.select = function () {
            this.input.select();
        };
        Field.prototype.getValue = function () {
            return this.input.getValue();
        };
        Field.prototype.setValue = function (value) {
            this.input.setValue(value);
            this.onChanged({ keyCode: 0 });
        };
        Field.prototype.getSelection = function () {
            return this.input.getSelection();
        };
        Field.prototype.hasSelection = function () {
            var selection = this.getSelection();
            return selection[0] !== selection[1];
        };
        Field.prototype.onBlur = function () {
            var _this = this;
            setTimeout(function () {
                if (!_this.validated)
                    _this.validate();
                _this.element.classList.remove('focused');
            }, 1);
        };
        Field.prototype.onFocus = function () {
            this.element.classList.add('focused');
        };
        Field.prototype.invalidate = function () {
            this.setValidity(0);
        };
        Field.prototype.setValidity = function (validity) {
            this.validity = validity;
            this.valid = validity === 1;
            this.element.classList.remove('validating');
            if (validity === 0) {
                this.validated = false;
                this.element.classList.remove('valid');
                this.element.classList.remove('invalid');
                return;
            }
            this.validated = true;
            if (validity === 1) {
                this.element.classList.remove('invalid');
                this.element.classList.add('valid');
            }
            else if (validity === 2) {
                this.element.classList.remove('valid');
                this.element.classList.add('invalid');
            }
            var e = {
                type: 'validated',
                valid: this.valid
            };
            $(this.element).trigger(e, this);
        };
        Field.prototype.onChanged = function (e) {
            if (e.keyCode === 9)
                return;
            this.invalidate();
            var val = this.getValue();
            var empty = val.length === 0;
            this.element.classList[empty ? 'add' : 'remove']('empty');
            if (this.type === 'checkbox') {
                this.element.classList[this.input.checked ? 'add' : 'remove']('checked');
            }
            if (this.type === 'creditcardnumber') {
                this.detectCreditCardType(val);
            }
            this.validated = false;
            if (this.validateFrequency) {
                if (this.c) {
                    this.c();
                }
                else {
                    this.c = this.validate.bind(this).debounce(this.validateFrequency);
                }
            }
            $(this.element).trigger({
                type: 'changed',
                name: this.name,
                value: val
            }, this);
            if (this.validateMode === 'immediate') {
                this.validate();
            }
        };
        Field.prototype.detectCreditCardType = function (val) {
            var _this = this;
            var ccTypeMap = {
                '4': 'visa',
                '5': 'masterCard',
                '3': 'americanExpress',
                '6': 'discover'
            };
            var type = (val && val.length) ? ccTypeMap[val[0]] : null;
            if (!type || !this.element.classList.contains(type)) {
                ['visa', 'masterCard', 'americanExpress', 'discover'].forEach(function (name) {
                    _this.element.classList.remove(name);
                });
                this.element.classList.add(type);
                $(this.element).trigger('creditCardTypeChanged', type);
            }
        };
        Field.prototype.validate = function () {
            var _this = this;
            this.errors = [];
            this.valid = true;
            this.validating = true;
            if (this.validateFrequency)
                this.element.classList.add('validating');
            var value = this.getValue();
            if (!this.required && value.empty()) {
                this.setState('valid');
                return Promise.resolve();
            }
            if (this.required && value.empty()) {
                this.addError({ message: 'Required' });
                this.setState('invalid');
                return Promise.resolve();
            }
            if (this.validators.length === 0) {
                this.setState('valid');
                return Promise.resolve();
            }
            var d = new $.Deferred();
            Promise.all(this.validators.map(function (v) { return v.validate(_this); }))
                .then(function () {
                console.log('validated all');
                var failedValidations = _this.validators.filter(function (v) { return !v.valid; });
                for (var _i = 0; _i < failedValidations.length; _i++) {
                    var validator = failedValidations[_i];
                    if (validator.replacement) {
                        _this.valid = true;
                        _this.replaced = true;
                        _this.setValue(validator.replacement);
                    }
                    else {
                        _this.valid = false;
                        if (validator.error) {
                            _this.addError(validator.error);
                        }
                    }
                }
                ;
                _this.setState(_this.valid ? 'valid' : 'invalid');
                if (_this.replaced) {
                    _this.replaced = false;
                    _this.validate().then(d.resolve);
                }
                else {
                    d.resolve();
                }
            });
            return d;
        };
        Field.prototype.addError = function (error) {
            this.errors.push(error);
        };
        Field.prototype.setState = function (state) {
            var _this = this;
            this.validated = true;
            this.validating = false;
            if (state === 'valid') {
                if (this.validateFrequency) {
                    setTimeout(function () {
                        _this.setValidity(1);
                    }, this.validateFrequency);
                }
                else {
                    this.setValidity(1);
                }
            }
            else if (state === 'invalid') {
                if (this.errors.length > 0 && this.messageEl) {
                    this.messageEl.innerHTML = this.errors[0].message;
                }
                if (this.validateFrequency) {
                    setTimeout(function () {
                        _this.setValidity(2);
                    }, this.validateFrequency);
                }
                else {
                    this.setValidity(2);
                }
            }
        };
        return Field;
    })();
    Carbon.Field = Field;
    var HtmlSelect = (function () {
        function HtmlSelect(element) {
            this.type = 'select';
            this.supportsChange = true;
            this.element = element;
            this.required = element.hasAttribute('required');
        }
        Object.defineProperty(HtmlSelect.prototype, "name", {
            get: function () {
                return this.element.name;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(HtmlSelect.prototype, "active", {
            get: function () { return false; },
            enumerable: true,
            configurable: true
        });
        HtmlSelect.prototype.getSelection = function () { return [0, 0]; };
        HtmlSelect.prototype.getValue = function () {
            return $(this.element).find('option:selected').text();
        };
        HtmlSelect.prototype.getJSONValue = function () {
            return this.getValue();
        };
        return HtmlSelect;
    })();
    Carbon.HtmlSelect = HtmlSelect;
    var HtmlCheckbox = (function () {
        function HtmlCheckbox(element) {
            this.type = 'checkbox';
            this.supportsChange = true;
            this.element = element;
            this.name = element.name;
            this.required = element.hasAttribute('required');
        }
        Object.defineProperty(HtmlCheckbox.prototype, "checked", {
            get: function () {
                return this.element.checked;
            },
            enumerable: true,
            configurable: true
        });
        HtmlCheckbox.prototype.getValue = function () {
            return this.checked.toString();
        };
        HtmlCheckbox.prototype.getJSONValue = function () {
            return this.getValue();
        };
        return HtmlCheckbox;
    })();
    Carbon.HtmlCheckbox = HtmlCheckbox;
    var HtmlInput = (function () {
        function HtmlInput(element) {
            this.supportsChange = true;
            this.element = element;
            this.type = element.getAttribute('type') || 'text';
            this.name = element.name;
            this.required = element.hasAttribute('required');
            this.autoCorrect = element.hasAttribute('autocorrect');
            this.autofocus = element.hasAttribute('autofocus');
            this.restrict = element.dataset['restrict'];
            this.validateRemote = element.dataset['validateRemote'];
            if (element.hasAttribute('data-validate-frequency')) {
                this.validateFrequency = parseInt(element.dataset['validateFrequency'], 10);
            }
            if (element.dataset['expand'] === 'auto') {
                new AutoExpander(this.element);
            }
            if (element.hasAttribute('minlength')) {
                this.minLength = parseInt(element.getAttribute('minlength'), 10);
            }
            if (element.hasAttribute('maxlength')) {
                this.maxLength = parseInt(element.getAttribute('maxlength'), 10);
            }
        }
        Object.defineProperty(HtmlInput.prototype, "active", {
            get: function () { return document.activeElement == this.element; },
            enumerable: true,
            configurable: true
        });
        HtmlInput.prototype.getSelection = function () {
            var start = this.element.selectionStart;
            var end = this.element.selectionEnd;
            if (start === undefined || end === undefined) {
            }
            return [start, end];
        };
        HtmlInput.prototype.focus = function () {
            this.element.focus();
        };
        HtmlInput.prototype.select = function () {
            this.element.select();
        };
        HtmlInput.prototype.getValue = function () {
            return this.element.value;
        };
        HtmlInput.prototype.getJSONValue = function () {
            return this.getValue();
        };
        HtmlInput.prototype.setValue = function (value) {
            this.element.value = value;
            $(this.element).trigger('change');
        };
        return HtmlInput;
    })();
    Carbon.HtmlInput = HtmlInput;
    var RequiredValidator = (function () {
        function RequiredValidator() {
        }
        RequiredValidator.prototype.validate = function (field) {
            var value = field.getValue();
            this.valid = value.trim().length > 0;
            if (!this.valid) {
                this.error = { message: 'Required' };
            }
            return Promise.resolve(this);
        };
        return RequiredValidator;
    })();
    var StringLengthValidator = (function () {
        function StringLengthValidator(minLength, maxLength) {
            this.minLength = minLength;
            this.maxLength = maxLength;
        }
        StringLengthValidator.prototype.validate = function (field) {
            var value = field.getValue();
            this.valid = value.length >= this.minLength && value.length <= this.maxLength;
            if (!this.valid) {
                if (value.length < this.minLength) {
                    this.error = { message: "Must be at least " + this.minLength + " characters." };
                }
                else {
                    this.error = { message: "Must be fewer than " + this.maxLength + " characters." };
                }
            }
            return Promise.resolve(this);
        };
        return StringLengthValidator;
    })();
    var UrlValidator = (function () {
        function UrlValidator(autoCorrect) {
            this.autoCorrect = autoCorrect;
        }
        UrlValidator.prototype.validate = function (field) {
            var value = field.getValue();
            var autoCorrected = false;
            if (this.autoCorrect && value.indexOf('://') === -1) {
                value = 'http://' + value;
                autoCorrected = true;
            }
            var regex = /^(?:(?:https?):\/\/)(?:\S+(?::\S*)?@)?(?:(?!10(?:\.\d{1,3}){3})(?!127(?:\.\d{1,3}){3})(?!169\.254(?:\.\d{1,3}){2})(?!192\.168(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/i;
            this.valid = regex.test(value);
            if (this.valid && this.autoCorrected) {
                field.setValue(value);
            }
            if (!this.valid) {
                this.error = { message: 'Not a valid url.' };
            }
            return Promise.resolve(this);
        };
        return UrlValidator;
    })();
    var EmailAddressValidator = (function () {
        function EmailAddressValidator() {
        }
        EmailAddressValidator.prototype.validate = function (field) {
            var value = field.getValue();
            this.valid = /^[a-zA-Z0-9_\.\-\+]+\@([a-zA-Z0-9\-]+\.)+[a-zA-Z0-9]{2,20}$/.test(value);
            if (!this.valid) {
                this.error = { message: 'Not a valid email address.' };
            }
            return Promise.resolve(this);
        };
        return EmailAddressValidator;
    })();
    var CreditCardNumberValidator = (function () {
        function CreditCardNumberValidator() {
        }
        CreditCardNumberValidator.prototype.validate = function (field) {
            var value = field.getValue();
            this.valid = Carbon.CreditCard.validate(value);
            if (!this.valid) {
                this.error = { message: "Not a valid credit card number." };
            }
            return Promise.resolve();
        };
        return CreditCardNumberValidator;
    })();
    var RemoteValidator = (function () {
        function RemoteValidator(url) {
            this.url = url;
        }
        RemoteValidator.prototype.validate = function (field) {
            var _this = this;
            var d = new $.Deferred();
            var value = field.getValue();
            this.valid = true;
            if (this.request && this.request.readyState != 4) {
                this.request.abort();
            }
            this.request = $.post(this.url, { value: value });
            this.request.then(function (data) {
                _this.valid = data.valid;
                _this.error = data.error;
                _this.replacement = data.replacement;
                d.resolve();
            });
            this.request.fail(function (xhr) { d.fail(); });
            return d;
        };
        return RemoteValidator;
    })();
    var AutoComplete = (function () {
        function AutoComplete(element, options) {
            var _this = this;
            this.hoveringList = false;
            this.ghostVal = '';
            var el = $(element);
            if (el.length === 0)
                throw new Error("element not found");
            this.element = el[0];
            if (options && options.listEl) {
                this.listEl = options.listEl;
            }
            else {
                this.listEl = this.element.querySelector('.suggestions');
            }
            if (!this.listEl)
                throw new Error('.suggestions element not found');
            if (!options) {
                options = $(this.listEl).data();
            }
            if (options.template == undefined)
                throw new Error('missing data-template');
            if (options.remote == undefined)
                throw new Error('missing data-remote');
            this.template = new Carbon.Template(options.template);
            this.remote = options.remote;
            this.limit = options.limit || 5;
            this.minLength = options.minLength || 1;
            this.inputEl = this.element.querySelector('input:not(.ghost)');
            this.ghostEl = this.element.querySelector('input.ghost');
            this.inputEl.setAttribute('autocomplete', 'off');
            if (this.ghostEl) {
                this.ghostEl.value = '';
            }
            if (!this.remote)
                throw new Error("remote not defined");
            this.inputEl.addEventListener('keydown', this.onKeyDown.bind(this), true);
            this.inputEl.addEventListener('keypress', this.onKeyPress.bind(this), true);
            this.inputEl.addEventListener('input', this.onInput.bind(this));
            this.inputEl.addEventListener('blur', this.onBlur.bind(this));
            $(this.listEl).on('click', 'li', this.liClicked.bind(this));
            $(this.listEl).hover(function () { _this.hoveringList = true; }, function () { _this.hoveringList = false; });
        }
        AutoComplete.prototype.onBlur = function (e) {
            if (this.hoveringList)
                return;
            this.close();
        };
        AutoComplete.prototype.on = function (name, callback) {
            $(this.element).on(name, callback);
        };
        AutoComplete.prototype.liClicked = function (e) {
            var li = e.currentTarget;
            this.select(li);
        };
        AutoComplete.prototype.onInput = function (e) {
            var code = e.which;
            if (code === 13 || code === 30 || code === 38 || code === 40)
                return;
            var val = this.inputEl.value;
            this.filter(val);
            this.updateGhost();
            if (val.length < this.minLength) {
                if (this.fetch)
                    this.fetch.abort();
                this._showList([]);
            }
            else {
                this.fetchSuggestions();
            }
        };
        AutoComplete.prototype.onKeyPress = function (e) {
            if (this.inputEl.dataset['restrict'] == 'tag') {
                if (InputRestriction.Tag(e))
                    e.preventDefault();
            }
        };
        AutoComplete.prototype.onKeyDown = function (e) {
            switch (e.which) {
                case 27:
                    this.escape(e);
                    break;
                case 9:
                    this.close();
                    break;
                case 13:
                    this.onEnter(e);
                    break;
                case 38:
                    this.up();
                    break;
                case 40:
                    this.down();
                    break;
            }
        };
        AutoComplete.prototype.escape = function (e) {
            e.stopPropagation();
            e.preventDefault();
            this.close();
        };
        AutoComplete.prototype.cancel = function () {
            this.ghostVal = '';
            this.close();
        };
        AutoComplete.prototype.close = function () {
            this.element.classList.remove('suggesting');
            this.listEl.innerHTML = '';
        };
        AutoComplete.prototype.updateGhost = function () {
            var val = this.inputEl.value.toLowerCase();
            if (!this.ghostEl)
                return;
            if (val.length === 0) {
                this.ghostEl.value = '';
            }
            if (!this.ghostVal)
                return;
            if (!this.ghostVal.toLowerCase().startsWith(val)) {
                this.ghostEl.value = '';
                return;
            }
            if (this.ghostVal.length > 0) {
                val = this.inputEl.value + this.ghostVal.substring(val.length);
            }
            this.ghostEl.value = val;
        };
        AutoComplete.prototype.up = function () {
            var selectedEl = this.listEl.querySelector('.selected');
            var prevEl;
            if (selectedEl) {
                selectedEl.classList.remove('selected');
                prevEl = selectedEl.previousElementSibling;
            }
            if (!prevEl)
                prevEl = this.listEl.children[this.listEl.children.length - 1];
            this.highlight(prevEl);
        };
        AutoComplete.prototype.down = function () {
            var selectedEl = this.listEl.querySelector('.selected');
            var nextEl;
            if (selectedEl) {
                selectedEl.classList.remove('selected');
                nextEl = selectedEl.nextElementSibling;
            }
            if (!nextEl)
                nextEl = this.listEl.children[0];
            this.highlight(nextEl);
        };
        AutoComplete.prototype.highlight = function (el) {
            if (!el)
                return;
            el.classList.add('selected');
            el.focus();
            var value = el.dataset['value'];
            this.inputEl.value = value;
            if (this.ghostEl) {
                this.ghostEl.value = value;
            }
        };
        AutoComplete.prototype.onEnter = function (e) {
            var selectedEl = this.listEl.querySelector('.selected');
            if (selectedEl) {
                e.preventDefault();
                this.select(selectedEl);
            }
        };
        AutoComplete.prototype.select = function (el) {
            var value = el.dataset['value'];
            this.inputEl.value = value;
            this.inputEl.focus();
            var e = {
                type: 'select',
                value: value,
                item: $(el).data('item'),
                target: el
            };
            Carbon.ActionKit.dispatch(e);
            $(this.element).triggerHandler(e);
            this.updateGhost();
            this._showList([]);
        };
        AutoComplete.prototype.filter = function (val) {
            return;
            val = val.toLowerCase();
            Array.from(this.listEl.children)
                .forEach(function (el) {
                var value = el.dataset['value'];
                if (value && !value.toLowerCase().includes(val)) {
                    el.remove();
                }
            });
        };
        AutoComplete.prototype.fetchSuggestions = function () {
            if (this.timeout) {
                clearTimeout(this.timeout);
            }
            this.timeout = setTimeout(this._fetchSuggestions.bind(this), 200);
        };
        AutoComplete.prototype._showList = function (data) {
            var _this = this;
            this.listEl.innerHTML = '';
            this.fetch = null;
            var val = this.inputEl.value.toLowerCase();
            data.forEach(function (item, i) {
                item.val = _this.inputEl.value;
                var el = _this.template.render(item);
                el.data('item', item);
                var value = el.data('value');
                if (i === 0) {
                    _this.ghostVal = value;
                }
                if ((i + 1) <= _this.limit) {
                    if (value.toLowerCase().includes(val)) {
                        el.appendTo(_this.listEl);
                    }
                }
            });
            if (this.listEl.children.length === 0) {
                this.ghostVal = '';
                this.element.classList.remove('suggesting');
            }
            else {
                this.element.classList.add('suggesting');
            }
            this.updateGhost();
        };
        AutoComplete.prototype._fetchSuggestions = function () {
            this.timeout = null;
            if (this.fetch)
                this.fetch.abort();
            var prefix = '?';
            if (this.remote.indexOf('?') > -1)
                prefix = '&';
            var val = this.inputEl.value;
            if (val.length < this.minLength) {
                return;
            }
            var url = "" + this.remote + prefix + "q=" + encodeURIComponent(val);
            this.fetch = $.get(url);
            this.fetch.then(this._showList.bind(this));
            return this.fetch;
        };
        AutoComplete.prototype.dispose = function () {
        };
        return AutoComplete;
    })();
    Carbon.AutoComplete = AutoComplete;
    var AutoExpander = (function () {
        function AutoExpander(element, options) {
            if (options === void 0) { options = {}; }
            this.height = 0;
            var textarea = $(element);
            this.diff = 0;
            var populated = (textarea.val().replace(/\s/g, '').length > 0);
            this.textarea = textarea;
            if (populated) {
                this.update();
            }
            this.textarea.on({
                keyup: this.onKeyUp.bind(this),
                poke: this.poked.bind(this)
            });
            this.maxHeight = options.maxHeight || 10000;
            this.textarea.on('scroll change', this.update.bind(this));
        }
        AutoExpander.prototype.poked = function () {
            this.update();
        };
        AutoExpander.prototype.onKeyUp = function (e) {
            var val = this.textarea.val();
            if (e.keyCode === 13 && !e.shiftKey) {
                if (val.replace(/\s/g, '').length === 0) {
                    e.stopPropagation();
                }
            }
            this.update();
        };
        AutoExpander.prototype.update = function () {
            var outerEl = this.textarea.closest('.outer');
            if (outerEl.length > 0) {
                outerEl.height(this.height);
            }
            this.textarea.height(0);
            var scrollHeight = this.textarea[0].scrollHeight;
            this.height = scrollHeight - this.diff;
            if (this.height > this.maxHeight) {
                this.height = this.maxHeight;
            }
            this.textarea.height(this.height);
            if (outerEl.length > 0) {
                outerEl.height(this.height);
            }
            this.textarea.trigger('expanded');
        };
        return AutoExpander;
    })();
    Carbon.AutoExpander = AutoExpander;
    var InputRestriction = {
        Number: function (e) { return !KeyEvent.isNumber(e); },
        Tag: function (e) {
            return e.which == 33 ||
                e.which == 35 ||
                e.which == 38 ||
                e.which == 42 ||
                e.which == 47;
        }
    };
    var KeyEvent = {
        isCommand: function (e) {
            if (e.metaKey)
                return true;
            switch (e.which) {
                case 8: return true;
                case 48: return true;
            }
            return false;
        },
        isNumber: function (e) {
            if (KeyEvent.isCommand(e))
                return true;
            var char = String.fromCharCode(e.which);
            return !!/[\d\s]/.test(char);
        }
    };
    Carbon.CreditCard = {
        Types: {
            Visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
            MasterCard: /^5[1-5][0-9]{14}$/,
            Amex: /^3[47][0-9]{13}$/,
            Discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/
        },
        validate: function (num) {
            num = Carbon.CreditCard.strip(num);
            return !!Carbon.CreditCard.getType(num) && Carbon.CreditCard.verifyLuhn10(num);
        },
        getLuhn10: function (num) {
            var revArr = num.split('').reverse();
            var total = 0;
            var tmp = 0;
            for (var i = 0; i < revArr.length; i++) {
                if ((i % 2) > 0) {
                    tmp = revArr[i] * 2;
                    tmp = (tmp < 9 ? tmp : (tmp - 9));
                    total += tmp;
                }
                else {
                    total += Number(revArr[i]);
                }
            }
            return total;
        },
        verifyLuhn10: function (num) {
            return Carbon.CreditCard.getLuhn10(num) % 10 == 0;
        },
        strip: function (num) {
            return num.replace(/-/g, "").replace(/ /g, "");
        },
        getType: function (num) {
            for (var type in Carbon.CreditCard.Types) {
                var regex = Carbon.CreditCard.Types[type];
                if (regex.test(num))
                    return type;
            }
            return null;
        }
    };
    var TokenList = (function () {
        function TokenList(element) {
            this.limit = 1000;
            this.selectedSuggestion = false;
            var el = $(element);
            if (el.data('controller'))
                throw new Error('Already setup');
            this.element = el[0];
            this.fieldEl = this.element.querySelector('.field');
            if (this.fieldEl.querySelector('.suggestions')) {
                this.autoComplete = new AutoComplete(this.fieldEl);
                this.autoComplete.on('selection', this.onSelection.bind(this));
            }
            this.inputEl = this.fieldEl.querySelector('input');
            this.listEl = this.element.querySelector('ul');
            this.inputEl.addEventListener('input', this.onInput.bind(this), false);
            this.inputEl.addEventListener('keydown', this.onKeyDown.bind(this), false);
            this.inputEl.addEventListener('blur', this.onBlur.bind(this), false);
            this.inputEl.addEventListener('paste', this.onPaste.bind(this), false);
            if (this.element.dataset['sortable']) {
                $(this.listEl).sortable({
                    scroll: false,
                    distance: 5
                });
            }
            this.limit = el.data('limit') || 100;
            this.maxLength = this.inputEl.maxLength;
            if (this.maxLength <= 0) {
                this.maxLength = 100;
            }
            this.inputEl.style.width = this.measureText('a') + 'px';
            el.on('click', this.clicked.bind(this));
            el.on('click', 'li:not(.field)', this.clickedLi.bind(this));
            var isEmpty = this.count() === 0;
            this.element.classList[(isEmpty ? 'add' : 'remove')]('empty');
            el.data('controller', this);
        }
        TokenList.get = function (el) {
            return $(el).data('controller') || new TokenList(el);
        };
        TokenList.prototype.on = function (name, callback) {
            $(this.element).on(name, callback);
        };
        TokenList.prototype.off = function (name) {
            $(this.element).off(name);
        };
        TokenList.prototype.getValues = function () {
            var _this = this;
            var els = this.listEl.querySelectorAll('li:not(.field)');
            return Array.from(els)
                .map(function (el) {
                var textEl = el.querySelector('.text');
                if (!textEl)
                    return '';
                return _this.canonicalize(textEl.textContent);
            })
                .filter(function (value) { return !!value; });
        };
        TokenList.prototype.canonicalize = function (value) {
            if (value === undefined)
                return '';
            return value.trim();
        };
        TokenList.prototype.getJSONValue = function () {
            return this.getValues();
        };
        TokenList.prototype.clickedLi = function (e) {
            var el = e.target.closest('li');
            this.remove(el);
        };
        TokenList.prototype.clicked = function (e) {
            if (e.target.closest('li'))
                return;
            e.stopPropagation();
            this.inputEl.select();
        };
        TokenList.prototype.onSelection = function (e) {
            var _this = this;
            this.selectedSuggestion = true;
            setTimeout(function () {
                _this.selectedSuggestion = false;
            }, 100);
            this.inputEl.value = '';
            this.add(e.value);
        };
        TokenList.prototype.onBlur = function (e) {
            var _this = this;
            setTimeout(function () {
                if (!_this.selectedSuggestion) {
                    _this.addCurrent();
                }
            }, 100);
        };
        TokenList.prototype.addCurrent = function () {
            var value = this.canonicalize(this.inputEl.value);
            if (value.length === 0 || value.length > this.maxLength)
                return false;
            var isDub = this.getValues().filter(function (text) { return text === value; }).length !== 0;
            if (isDub) {
                this.inputEl.classList.add('dub');
                return;
            }
            this.inputEl.classList.remove('dub');
            this.inputEl.value = '';
            this.inputEl.style.width = this.measureText('a') + 'px';
            this.add(value);
        };
        TokenList.prototype.onKeyDown = function (e) {
            if (e.which === 13 || e.which === 188) {
                e.preventDefault();
                this.addCurrent();
                return false;
            }
            if (e.which === 8) {
                if (this.inputEl.value.length === 0) {
                    var els = this.listEl.querySelectorAll('li:not(.field)');
                    if (els.length == 0)
                        return;
                    var lastEl = els[els.length - 1];
                    if (lastEl)
                        this.remove(lastEl);
                }
            }
        };
        TokenList.prototype.onInput = function () {
            this.inputEl.classList.remove('dub');
            var width = this.measureText(this.inputEl.value);
            if (this.inputEl.value.length > 0) {
                this.element.classList.remove('empty');
            }
            else if (this.count() === 0) {
                this.element.classList.add('empty');
            }
            this.inputEl.style.width = width + 'px';
        };
        TokenList.prototype.onPaste = function (e) {
            if (e.clipboardData && e.clipboardData.getData) {
                var text = e.clipboardData.getData('Text');
                if (text) {
                    this.addRange(text.split(','));
                    e.stopPropagation();
                    e.preventDefault();
                }
            }
        };
        TokenList.prototype.measureText = function (text) {
            var mEl = $(this.inputEl);
            if (!this.tempEl) {
                this.tempEl = $('<span />').css({
                    position: 'fixed',
                    left: '-5000px',
                    top: '-5000px',
                    fontFamily: mEl.css('font-family'),
                    fontSize: mEl.css('font-size'),
                    fontWeight: mEl.css('font-weight'),
                    padding: mEl.css('padding'),
                    margin: mEl.css('margin'),
                    whiteSpace: 'pre',
                    visiblity: 'hidden'
                });
                this.tempEl.appendTo('body');
            }
            this.tempEl.text(text);
            return this.tempEl.width() + 4;
        };
        TokenList.prototype.addRange = function (list) {
            for (var _i = 0; _i < list.length; _i++) {
                var item = list[_i];
                this.add(item.trim());
            }
        };
        TokenList.prototype.add = function (value) {
            var count = this.getValues().length;
            if (count >= this.limit) {
                console.log('reached limit');
                return;
            }
            if (value.trim().length === 0)
                return;
            var liEl = document.createElement('li');
            var spanEl = document.createElement('span');
            spanEl.classList.add('text');
            spanEl.textContent = value;
            liEl.appendChild(spanEl);
            var fieldEl = this.listEl.querySelector('.field');
            if (fieldEl) {
                this.listEl.insertBefore(liEl, fieldEl);
            }
            else {
                this.listEl.appendChild(liEl);
            }
            if (this.autoComplete) {
                this.autoComplete.cancel();
            }
            this.element.classList.remove('empty');
            $(this.element).triggerHandler({
                type: 'added',
                text: value,
                element: liEl
            });
            $(this.element).trigger('modified');
        };
        TokenList.prototype.clear = function () {
            var els = this.listEl.querySelectorAll('li:not(.field)');
            $(els).remove();
            this.element.classList.add('empty');
        };
        TokenList.prototype.count = function () {
            return this.listEl.querySelectorAll('li:not(.field)').length;
        };
        TokenList.prototype.remove = function (el) {
            var textEl = el.querySelector('.text');
            var text = textEl.textContent;
            $(el).remove();
            if (this.count() === 0) {
                this.element.classList.add('empty');
                this.inputEl.select();
            }
            $(this.element).triggerHandler({
                type: 'removed',
                text: text
            });
            $(this.element).trigger('modified');
        };
        TokenList.prototype.dispose = function () {
            $(this.element).removeData('controller');
            $(this.element).off();
            if (this.tempEl) {
                this.tempEl.remove();
            }
        };
        return TokenList;
    })();
    Carbon.TokenList = TokenList;
})(Carbon || (Carbon = {}));

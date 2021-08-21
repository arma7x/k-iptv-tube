var xhr = function(method, url, data={}, query={}, headers={}) {
  headers['User-Agent'] = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36";
  return new Promise((resolve, reject) => {
    var xhttp = new XMLHttpRequest({ mozSystem: true });
    var _url = new URL(url);
    for (var y in query) {
      _url.searchParams.set(y, query[y]);
    }
    url = _url.origin + _url.pathname + '?' + _url.searchParams.toString();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4) {
        if (this.status >= 200 && this.status <= 299) {
          try {
            const response = JSON.parse(xhttp.response);
            resolve({ raw: xhttp, response: response});
          } catch (e) {
            resolve({ raw: xhttp, response: xhttp.responseText});
          }
        } else {
          try {
            const response = JSON.parse(xhttp.response);
            reject({ raw: xhttp, response: response});
          } catch (e) {
            reject({ raw: xhttp, response: xhttp.responseText});
          }
        }
      }
    };
    xhttp.open(method, url, true);
    for (var x in headers) {
      xhttp.setRequestHeader(x, headers[x]);
    }
    if (Object.keys(data).length > 0) {
      xhttp.send(JSON.stringify(data));
    } else {
      xhttp.send();
    }
  });
}

const SDCARD = navigator.getDeviceStorage('sdcard');

function saveToDisk(blob, name, cb = () => {}) {
  var path = name.split('/');
  var name = path.pop();
  if (SDCARD.storageName !== '') {
    path = `/${SDCARD.storageName}/${path.join('/')}/${name}`;
  } else {
    path = `${path.join('/')}/${name}`;
  }
  const addFile = SDCARD.addNamed(blob, path);
  addFile.onsuccess = (evt) => {
    cb(path);
  }
  addFile.onerror = (err) => {
    cb(false);
  }
}

function getFromNetwork(path, resolve, reject) {
  xhr('GET', BASE_URL + '/' + path)
  .then((data) => {
    const blob = new Blob([data.response.toString()], {type : 'audio/x-mpegurl'});
    saveToDisk(blob, path);
    resolve(data.response);
  })
  .catch((err) => {
    reject(err);
  });
}

function getFromDisk(path) {
  const _path = path;
  return new Promise((resolve, reject) => {
    if (SDCARD.storageName !== '') {
      path = `/${SDCARD.storageName}/${path}`;
    }
    var request = SDCARD.get(path);
    request.onsuccess = function () {
      var reader = new FileReader();
      reader.onload = function() {
        resolve(reader.result);
      };
      reader.onerror = function() {
        getFromNetwork(_path, resolve, reject);
      };
      reader.readAsText(this.result);
    }
    request.onerror = function () {
      getFromNetwork(_path, resolve, reject);
    }
  });
}

if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function(str, newStr){
    // If a regex pattern
    if (Object.prototype.toString.call(str).toLowerCase() === '[object regexp]') {
      return this.replace(str, newStr);
    }
    // If a string
    return this.replace(new RegExp(str, 'g'), newStr);

  };
}

function parse(a) {
  var metadata = [];
  const b = a.replaceAll('\"', '');
  const seg = b.split('=');
  for (var i=0;i<seg.length - 1;i++) {
    const n = seg[i].split(' ');
    const n1 = seg[i + 1].split('tvg-');
    metadata[n[n.length - 1]] = n1[0];
  }
  if (metadata['tvg-logo']) {
    const s = metadata['tvg-logo'].split(' ');
    metadata['tvg-logo'] = s[0];
  }
  return metadata;
}

const generateID = function(url) {
  const hashids2 = new Hashids(url, 15);
  return hashids2.encode(1);
}

const APP_VERSION = '1.4.0';

localforage.setDriver(localforage.LOCALSTORAGE);

window.addEventListener("load", function() {

  const state = new KaiState({
    BOOKMARKS: {}
  });

  localforage.getItem('BOOKMARKS')
  .then((BOOKMARKS) => {
    if (BOOKMARKS == null) {
      BOOKMARKS = {};
    }
    state.setState('BOOKMARKS', BOOKMARKS);
  });

  const playVideo = function($router, meta) {
    $router.push(
      new Kai({
        name: 'vplayer',
        data: {
          title: 'vplayer',
          width: 1,
          height: 1,
          ration: 1,
        },
        templateUrl: document.location.origin + '/templates/player.html',
        mounted: function() {
          console.log(meta.url);
          this.$router.setHeaderTitle(meta.name);
          this.$router.showLoading(false);
          var video = document.getElementById('vplayer');
          video.onloadedmetadata = (evt) => {
            this.data.ratio = evt.target.width / evt.target.height;
            video.width = 240;
            video.clientHeight = 240 / this.data.ratio;
            this.data.width = video.width;
            this.data.height = video.clientHeight;
            window['hls'].startLoad();
          }
          video.oncanplaythrough = (evt) => {
            window['video'].play();
            this.$router.hideLoading();
          }
          video.onprogress = (evt) => {
            this.$router.showLoading(false);
          }
          var hls = new Hls({ autoStartLoad: true });
          hls.loadSource(meta.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.BUFFER_APPENDED, () => {
            window['video'].play();
            this.$router.hideLoading();
          })
          hls.on(Hls.Events.ERROR, function (event, data) {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.log('fatal network error encountered, try to recover');
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.log('fatal media error encountered, try to recover');
                  hls.recoverMediaError();
                  break;
                default:
                  $router.showToast("ERROR");
                  hls.destroy();
                  break;
              }
            }
          });
          hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            console.log('manifest loaded, found ' + data.levels.length + ' quality level');
          });
          window['hls'] = hls;
          window['video'] = video;
        },
        unmounted: function() {
          this.$router.hideLoading();
          window['hls'].destroy();
          window['hls'] = null;
          window['video'] = null;
          displayKaiAds();
        },
        softKeyText: { left: 'Fullscreen', center: '', right: '' },
        softKeyListener: {
          left: function() {
            if (!document.fullscreenElement) {
              document.getElementById('app').requestFullscreen();
              screen.orientation.lock('landscape');
              document.getElementById('vplayer').width = 320;
              document.getElementById('vplayer').clientHeight = (320 / this.data.ratio);
              this.$router.setSoftKeyLeftText('Exit Fullscreen');
              document.getElementById('__kai_soft_key__').style.display = 'none';
              $router.showToast('Click Back/EndCall to exit fullscreen');
              document.getElementById('vplayer').style.marginTop = '20px';
            } else {
              screen.orientation.unlock();
              document.exitFullscreen();
              document.getElementById('vplayer').width = this.data.width;
              document.getElementById('vplayer').clientHeight = this.data.height;
              this.$router.setSoftKeyLeftText('Fullscreen');
              document.getElementById('__kai_soft_key__').style.display = '';
              document.getElementById('vplayer').style.marginTop = '0px';
            }
          },
          center: function() {},
          right: function() {}
        },
        dPadNavListener: {
          arrowUp: function() {
            if (navigator.volumeManager) {
              navigator.volumeManager.requestShow();
            } else {
            }
          },
          arrowRight: function() {
          },
          arrowDown: function() {
            if (navigator.volumeManager) {
              navigator.volumeManager.requestShow();
            } else {
            }
          },
          arrowLeft: function() {
          },
        },
        backKeyListener: function() {
          if (document.fullscreenElement) {
            screen.orientation.unlock();
            document.exitFullscreen();
            document.getElementById('vplayer').width = this.data.width;
            document.getElementById('vplayer').clientHeight = this.data.height;
            this.$router.setSoftKeyLeftText('Fullscreen');
            document.getElementById('__kai_soft_key__').style.display = '';
            document.getElementById('vplayer').style.marginTop = '0px';
            return true;
          } else {
            return false;
          }
        }
      })
    );

  }

  const addRemoveFavourite = function($router, meta) {
    return new Promise((resolve, reject) => {
      localforage.getItem('BOOKMARKS')
      .then((BOOKMARKS) => {
        if (BOOKMARKS == null) {
          BOOKMARKS = {};
        }
        if (BOOKMARKS[meta.id] == null) {
          BOOKMARKS[meta.id] = meta;
          $router.showToast("Bookmarked");
        } else {
          delete BOOKMARKS[meta.id];
          $router.showToast("Removed");
        }
        return localforage.setItem('BOOKMARKS', BOOKMARKS)
        .then(() => {
          return localforage.getItem('BOOKMARKS');
        });
      })
      .then((UPDATE) => {
        state.setState('BOOKMARKS', UPDATE);
        resolve(UPDATE);
      })
      .catch((e) => {
        reject(e);
        $router.showToast("Error");
      });
    });
  }

  const browseChannel = function($router, item) {
    $router.showLoading();
    console.log(item.url);
    getFromDisk(item.url)
    .then((response) => {
      var channels = [];
      var d = M3U.parse(response);
      for (var x in d) {
        if (d[x]) {
          const meta = parse(d[x].title);
          channels.push({
            name: meta['tvg-name'],
            country: meta['tvg-country'],
            lang: meta['tvg-language'],
            desc: meta['group-title'],
            url: d[x].file,
            id: generateID(d[x].file)
          });
        }
      }
      $router.push(
        new Kai({
          name: 'channel',
          data: {
            title: '_channel_',
            channels: channels,
          },
          verticalNavClass: '.channelNav',
          templateUrl: document.location.origin + '/templates/channels.html',
          mounted: function() {
            this.$router.setHeaderTitle(item.name);
            this.methods.renderSKRight();
          },
          unmounted: function() {},
          methods: {
            selected: function(meta) {
              playVideo($router, meta);
            },
            renderSKRight: function() {
              if (this.$router.bottomSheet) {
                return
              }
              this.$router.setSoftKeyRightText('');
              if (this.verticalNavIndex > -1) {
                const selected = this.data.channels[this.verticalNavIndex];
                if (selected) {
                  if (state.getState('BOOKMARKS')[selected.id]) {
                    this.$router.setSoftKeyRightText('Remove');
                  } else {
                    this.$router.setSoftKeyRightText('Bookmark');
                  }
                }
              }
            }
          },
          softKeyText: { left: '', center: 'SELECT', right: '' },
          softKeyListener: {
            left: function() {},
            center: function() {
              const selected = this.data.channels[this.verticalNavIndex];
              if (selected) {
                this.methods.selected(selected);
              }
            },
            right: function() {
              const selected = this.data.channels[this.verticalNavIndex];
              if (selected) {
                addRemoveFavourite($router, selected)
                .finally(() => {
                  this.methods.renderSKRight();
                });
              }
            }
          },
          dPadNavListener: {
            arrowUp: function() {
              this.navigateListNav(-1);
              this.methods.renderSKRight();
            },
            arrowDown: function() {
              this.navigateListNav(1);
              this.methods.renderSKRight();
            }
          }
        })
      );
    })
    .catch((err) => {
      $router.showToast("Error, Try Again");
      console.log(err);
    })
    .finally(() => {
      $router.hideLoading();
    })
  }

  const browseBookmark = function($router, channels) {
    $router.push(
      new Kai({
        name: 'channel',
        data: {
          title: '_channel_',
          channels: channels,
        },
        verticalNavClass: '.channelNav',
        templateUrl: document.location.origin + '/templates/channels.html',
        mounted: function() {
          this.$router.setHeaderTitle('Bookmarks');
          this.methods.renderSKRight();
        },
        unmounted: function() {},
        methods: {
          selected: function(meta) {
            playVideo($router, meta);
          },
          renderSKRight: function() {
            if (this.$router.bottomSheet) {
              return
            }
            this.$router.setSoftKeyText('', '', '');
            if (this.verticalNavIndex > -1) {
              const selected = this.data.channels[this.verticalNavIndex];
              if (selected) {
                if (state.getState('BOOKMARKS')[selected.id]) {
                  this.$router.setSoftKeyText(' ', 'SELECT', 'Remove');
                }
              }
            }
          }
        },
        softKeyText: { left: '', center: '', right: '' },
        softKeyListener: {
          left: function() {},
          center: function() {
            const selected = this.data.channels[this.verticalNavIndex];
            if (selected) {
              this.methods.selected(selected);
            }
          },
          right: function() {
            const selected = this.data.channels[this.verticalNavIndex];
            if (selected) {
              addRemoveFavourite($router, selected)
              .finally(() => {
                var updated = [];
                var bookmarks = state.getState('BOOKMARKS');
                for (var x in bookmarks) {
                  updated.push(bookmarks[x]);
                }
                if (this.verticalNavIndex > updated.length - 1)
                  this.verticalNavIndex -= 1
                this.setData({ channels: updated });
                this.methods.renderSKRight();
              });
            }
          }
        },
        dPadNavListener: {
          arrowUp: function() {
            this.navigateListNav(-1);
            this.methods.renderSKRight();
          },
          arrowDown: function() {
            this.navigateListNav(1);
            this.methods.renderSKRight();
          }
        }
      })
    );
  }

  const browseCategory = function($router, name) {
    var LINKS = [];
    if (name === 'By Category') {
      for (var x in CATEGORY) {
        LINKS.push({ name: x, url: CATEGORY[x] });
      }
    } else if (name === 'By Country') {
      for (var x in COUNTRY) {
        LINKS.push({ name: x, url: COUNTRY[x] });
      }
    } else if (name === 'By Language') {
      for (var x in LANGUAGE) {
        LINKS.push({ name: x, url: LANGUAGE[x] });
      }
    }
    $router.push(
      new Kai({
        name: 'browse',
        data: {
          title: 'browse',
          list: LINKS,
        },
        verticalNavClass: '.homeNav',
        templateUrl: document.location.origin + '/templates/home.html',
        mounted: function() {
          this.$router.setHeaderTitle(name);
          this.methods.renderSoftKeyLCR();
        },
        unmounted: function() {
        },
        methods: {
          selected: function(item) {
            browseChannel($router, item);
          },
          renderSoftKeyLCR: function() {
            if (this.$router.bottomSheet) {
              return
            }
            if (this.verticalNavIndex > -1) {
              const selected = this.data.list[this.verticalNavIndex];
              if (selected) {
                this.$router.setSoftKeyCenterText('SELECT');
              }
            }
          },
          search: function(keyword) {
            const results = [];
            for (var x in LINKS) {
              if (LINKS[x].name.toLowerCase().indexOf(keyword.toLowerCase()) > -1) {
                results.push(LINKS[x]);
              }
            }
            this.verticalNavIndex = -1;
            this.setData({ list: results });
          }
        },
        softKeyText: { left: 'Search', center: '', right: 'Reset' },
        softKeyListener: {
          left: function() {
            const searchDialog = Kai.createDialog('Search', '<div><input id="search-input" placeholder="Enter your keyword" class="kui-input" type="text" /></div>', null, '', undefined, '', undefined, '', undefined, undefined, this.$router);
            searchDialog.mounted = () => {
              setTimeout(() => {
                setTimeout(() => {
                  this.$router.setSoftKeyText('Cancel' , '', 'Search');
                }, 103);
                const SEARCH_INPUT = document.getElementById('search-input');
                if (!SEARCH_INPUT) {
                  return;
                }
                SEARCH_INPUT.focus();
                SEARCH_INPUT.addEventListener('keydown', (evt) => {
                  switch (evt.key) {
                    case 'Backspace':
                    case 'EndCall':
                      if (document.activeElement.value.length === 0) {
                        this.$router.hideBottomSheet();
                        setTimeout(() => {
                          this.methods.renderSoftKeyLCR();
                          SEARCH_INPUT.blur();
                        }, 100);
                      }
                      break
                    case 'SoftRight':
                      this.$router.hideBottomSheet();
                      setTimeout(() => {
                        this.methods.renderSoftKeyLCR();
                        SEARCH_INPUT.blur();
                        this.methods.search(SEARCH_INPUT.value);
                      }, 100);
                      break
                    case 'SoftLeft':
                      this.$router.hideBottomSheet();
                      setTimeout(() => {
                        this.methods.renderSoftKeyLCR();
                        SEARCH_INPUT.blur();
                      }, 100);
                      break
                  }
                });
              });
            }
            searchDialog.dPadNavListener = {
              arrowUp: function() {
                const SEARCH_INPUT = document.getElementById('search-input');
                SEARCH_INPUT.focus();
              },
              arrowDown: function() {
                const SEARCH_INPUT = document.getElementById('search-input');
                SEARCH_INPUT.focus();
              }
            }
            this.$router.showBottomSheet(searchDialog);
          },
          center: function() {
            const selected = this.data.list[this.verticalNavIndex];
            if (selected) {
              this.methods.selected(selected);
            }
          },
          right: function() {
            this.verticalNavIndex = -1;
            this.setData({ list: LINKS });
          }
        },
        dPadNavListener: {
          arrowUp: function() {
            if (this.verticalNavIndex <= 0) {
              return
            }
            this.navigateListNav(-1);
          },
          arrowDown: function() {
            if (this.verticalNavIndex === this.data.list.length - 1) {
              return
            }
            this.navigateListNav(1);
          }
        },
        backKeyListener: function() {}
      })
    );
  }

  const helpSupportPage = new Kai({
    name: 'helpSupportPage',
    data: {
      title: 'helpSupportPage'
    },
    templateUrl: document.location.origin + '/templates/helpnsupport.html',
    mounted: function() {
      this.$router.setHeaderTitle('Help & Support');
      navigator.spatialNavigationEnabled = false;
    },
    unmounted: function() {},
    methods: {},
    softKeyText: { left: '', center: '', right: '' },
    softKeyListener: {
      left: function() {},
      center: function() {},
      right: function() {}
    }
  });

  const localFiles = new Kai({
    name: 'localFiles',
    data: {
      title: 'localFiles',
      files: []
    },
    verticalNavClass: '.fileNav',
    templateUrl: document.location.origin + '/templates/localFiles.html',
    mounted: function() {
      navigator.spatialNavigationEnabled = false;
      this.$router.setHeaderTitle('Local M3U8');
      localforage.getItem('LOCAL_FILES')
      .then((files) => {
        if (!files) {
          window['__DS__'] = new DataStorage(this.methods.onChange, this.methods.onReady);
        } else {
          this.setData({files: files});
        }
      });
    },
    unmounted: function() {
      if (window['__DS__']) {
        window['__DS__'].destroy();
      }
    },
    methods: {
      selected: function() {},
      onChange: function(fileRegistry, documentTree, groups) {
        this.methods.runFilter(groups['iptv'] || {});
      },
      onReady: function(status) {
        if (status) {
          this.$router.hideLoading();
        } else {
          this.$router.showLoading(false);
        }
      },
      runFilter: function(fileRegistry) {
        var files = []
        fileRegistry.forEach((file) => {
          var n = file.split('/');
          var n1 = n[n.length - 1];
          var n2 = n1.split('.');
          if (n2.length > 1) {
            files.push({'name': n1, 'path': file});
          }
        });
        this.setData({files: files});
        localforage.setItem('LOCAL_FILES', files);
      }
    },
    softKeyText: { left: 'Refresh', center: 'SELECT', right: '' },
    softKeyListener: {
      left: function() {
        window['__DS__'] = new DataStorage(this.methods.onChange, this.methods.onReady);
      },
      center: function() {
        var file = this.data.files[this.verticalNavIndex];
        if (file) {
          if (window['__DS__'] == null)
            window['__DS__'] = new DataStorage();
          window['__DS__'].__getFile__(file.path, (result) => {
            var reader = new FileReader();
            reader.onload = (event) => {
              playVideo(this.$router, { name: file.name, url: event.target.result.trim() });
            };
            reader.readAsText(result);
          }, (err) => {
            console.log(err);
          });
        }
      },
      right: function() {}
    },
    dPadNavListener: {
      arrowUp: function() {
        this.navigateListNav(-1);
      },
      arrowRight: function() {
        //this.navigateTabNav(-1);
      },
      arrowDown: function() {
        this.navigateListNav(1);
      },
      arrowLeft: function() {
        //this.navigateTabNav(1);
      },
    },
    backKeyListener: function() {}
  });

  const home = new Kai({
    name: 'home',
    data: {
      title: 'home',
      list: [
        {name : 'By Category'},
        {name : 'By Country'},
        {name : 'By Language'},
      ],
    },
    verticalNavClass: '.homeNav',
    templateUrl: document.location.origin + '/templates/home.html',
    mounted: function() {
      this.$router.setHeaderTitle('Browse IPTV');
      localforage.getItem('APP_VERSION')
      .then((v) => {
        if (v == null || v != APP_VERSION) {
          this.$router.showToast('Add menu to Clear Local Caches');
          this.$router.push('helpSupportPage');
        }
        localforage.setItem('APP_VERSION', APP_VERSION)
      });
    },
    unmounted: function() {
    },
    methods: {
      selected: function(item) {
        browseCategory(this.$router, item.name);
      },
    },
    softKeyText: { left: 'Menu', center: 'SELECT', right: 'Exit' },
    softKeyListener: {
      left: function() {
        var menus = [
          { "text": "Help" },
          { "text": "Bookmarks" },
          { "text": "Local M3U8" },
          { "text": "Clear Local Caches" }
        ];
        this.$router.showOptionMenu('Menu', menus, 'Select', (selected) => {
          if (selected.text === 'Help') {
            this.$router.push('helpSupportPage');
          } else if (selected.text === 'Bookmarks') {
            var channels = [];
            var bookmarks = this.$state.getState('BOOKMARKS');
            for (var x in bookmarks) {
              channels.push(bookmarks[x]);
            }
            browseBookmark(this.$router, channels);
          } else if (selected.text == 'Local M3U8') {
            this.$router.push('localFiles');
          } else if (selected.text == 'Clear Local Caches') {
            const DS = new DataStorage(()=>{}, (status) => {
              if (status) {
                if (DS.fileRegistry) {
                  const caches = [];
                  DS.fileRegistry.forEach((path) => {
                    if (path.indexOf('iptv') > -1 && path.indexOf('m3u') > -1) {
                      if (path[0] === '/') {
                        path = path.substring(1, path.length);
                      }
                      caches.push(path);
                    }
                  });
                  if (caches.length > 0) {
                    this.$router.showLoading();
                    var done = 0;
                    caches.forEach((path) => {
                      const paths = path.split('/');
                      const name = paths.pop();
                      console.log(paths, name);
                      DS.deleteFile(paths, name)
                      .finally(() => {
                        done += 1;
                        if (caches.length >= done) {
                          this.$router.showToast("DONE");
                          this.$router.hideLoading();
                          DS.destroy();
                        }
                      });
                    });
                  } else {
                    DS.destroy();
                  }
                }
              }
            });
          }
        });
      },
      center: function() {
        const selected = this.data.list[this.verticalNavIndex];
        if (selected) {
          this.methods.selected(selected);
        }
      },
      right: function() {
        this.$router.showDialog('Exit', 'Are you sure to exit ?', null, 'Yes', () => {
          window.close();
        }, 'No', () => {
          setTimeout(() => {
            this.methods.renderSoftKeyLCR();
          }, 500);
        }, ' ', null, () => {});
      }
    },
    dPadNavListener: {
      arrowUp: function() {
        if (this.verticalNavIndex <= 0) {
          return
        }
        this.navigateListNav(-1);
      },
      arrowDown: function() {
        if (this.verticalNavIndex === this.data.list.length - 1) {
          return
        }
        this.navigateListNav(1);
      }
    },
    backKeyListener: function() {
      return false;
    }
  });

  const router = new KaiRouter({
    title: 'KaiKit',
    routes: {
      'index' : {
        name: 'home',
        component: home
      },
      'localFiles' : {
        name: 'localFiles',
        component: localFiles
      },
      'helpSupportPage': {
        name: 'helpSupportPage',
        component: helpSupportPage
      },
    }
  });

  const app = new Kai({
    name: '_APP_',
    data: {},
    templateUrl: document.location.origin + '/templates/template.html',
    mounted: function() {},
    unmounted: function() {},
    router,
    state
  });

  try {
    app.mount('app');
  } catch(e) {
    console.log(e);
  }

  function displayKaiAds() {
    var display = true;
    if (window['kaiadstimer'] == null) {
      window['kaiadstimer'] = new Date();
    } else {
      var now = new Date();
      if ((now - window['kaiadstimer']) < 300000) {
        display = false;
      } else {
        window['kaiadstimer'] = now;
      }
    }
    console.log('Display Ads:', display);
    if (!display)
      return;
    getKaiAd({
      publisher: 'ac3140f7-08d6-46d9-aa6f-d861720fba66',
      app: 'iptv-tube',
      slot: 'kaios',
      onerror: err => console.error(err),
      onready: ad => {
        ad.call('display')
        ad.on('close', () => {
          app.$router.hideBottomSheet();
          document.body.style.position = '';
        });
        ad.on('display', () => {
          app.$router.hideBottomSheet();
          document.body.style.position = '';
        });
      }
    })
  }

  displayKaiAds();

  document.addEventListener('visibilitychange', function(ev) {
    if (document.visibilityState === 'visible') {
      displayKaiAds();
    }
  });

});

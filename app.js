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

function filterLanguages(evt) {
  var result = false
  for (var x in evt.languages) {
    if (evt.languages[x].name) {
      if (evt.languages[x].name.indexOf(param) > -1) {
        result = true;
        break;
      }
    }
  }
  return result;
}

function filterCountries(evt) {
  var result = false
  for (var x in evt.countries) {
    if (evt.countries[x].name) {
      if (evt.countries[x].name.indexOf(param) > -1) {
        result = true;
        break;
      }
    }
  }
  return result;
}

function filterCategory(evt) {
  var result = false
  if (evt.category) {
    if (evt.category.indexOf(param) > -1) {
      result = true;
    }
  }
  return result;
}

const downloadChannel = function(param, cb) {
  this.param = param;
  return xhr('GET', `${document.location.origin}/channels.json`)
  .then(res => {
    function removeNSFW(evt) {
      return evt.category !== "XXX" && evt.category !== "xxx"; // REMOVE ALL NSFW
    }
    var filtered = res.response.filter(removeNSFW);
    filtered = filtered.filter(cb.bind(this));
    return Promise.resolve(filtered);
  })
  .catch(e => {
    return Promise.reject("Error");
  })
}

window.addEventListener("load", function() {

  const state = new KaiState({});

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
          hls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
            console.log('manifest loaded, found ' + data.levels.length + ' quality level');
          });
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
            } else {
              screen.orientation.unlock();
              document.exitFullscreen();
              document.getElementById('vplayer').width = this.data.width;
              document.getElementById('vplayer').clientHeight = this.data.height;
              this.$router.setSoftKeyLeftText('Fullscreen');
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
            return true;
          } else {
            return false;
          }
        }
      })
    );

  }

  const browseChannel = function($router, item, cb) {
    $router.showLoading();
    downloadChannel(item.name, cb)
    .then((res) => {
      var channels = [];
      for (var i in res) {
        const c = res[i];
        if (c) {
          var countries = [];
          for (var j in c.countries) {
            countries.push(c.countries[j].name);
          }
          var langs = [];
          for (var k in c.languages) {
            langs.push(c.languages[k].name);
          }
          c.country = countries.join(', ');
          c.lang = langs.join(', ');
          channels.push(c);
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
          },
          unmounted: function() {},
          methods: {
            selected: function(meta) {
              playVideo($router, meta);
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
            right: function() {}
          },
          dPadNavListener: {
            arrowUp: function() {
              this.navigateListNav(-1);
            },
            arrowDown: function() {
              this.navigateListNav(1);
            }
          }
        })
      );
    })
    .catch((err) => {
      $router.showToast(err.toString());
      console.log(err);
    })
    .finally(() => {
      $router.hideLoading();
    })
  }

  const browseCategory = function($router, name) {
    var LINKS = [];
    var cb;
    if (name === 'By Category') {
      for (var x in CATEGORY) {
        LINKS.push({ name: x, url: CATEGORY[x] });
        cb = filterCategory;
      }
    } else if (name === 'By Country') {
      for (var x in COUNTRY) {
        LINKS.push({ name: x, url: COUNTRY[x] });
        cb = filterCountries;
      }
    } else if (name === 'By Language') {
      for (var x in LANGUAGE) {
        LINKS.push({ name: x, url: LANGUAGE[x] });
        cb = filterLanguages;
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
            browseChannel($router, item, cb);
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
    },
    unmounted: function() {
    },
    methods: {
      selected: function(item) {
        browseCategory(this.$router, item.name);
      },
    },
    softKeyText: { left: 'Help', center: 'SELECT', right: 'Exit' },
    softKeyListener: {
      left: function() {
        this.$router.push('helpSupportPage');
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
        setTimeout(() => {
          document.body.style.position = '';
        }, 1000);
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
  .then(function(swReg) {
    console.error('Service Worker Registered');
  })
  .catch(function(error) {
    console.error('Service Worker Error', error);
  });
}

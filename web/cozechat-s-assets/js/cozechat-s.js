// 获取预设问题
fetch('/avatarhuman/prompt.json', {
    method: 'get',
    headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        'Accept': '*/*'
    },
}).then(response => {
    if (response.body) {
        let reader = response.body.getReader();
        reader.read().then(function processStream({ done, value }) {
            let str = new TextDecoder('utf-8').decode(value);
            try {
                let obj = JSON.parse(str)
                PresetProblem = obj.prompt;
                let box = document.getElementById('PresetProblem_list');
                let domstr = '';
                obj.prompt.forEach(item => {
                    domstr += `<div><div class="PresetProblem_item" title="点击发送预设问题">${item}</div></div>`
                })
                box.innerHTML = domstr
            } catch (error) {
                console.log('获取获取预设问题失败！', error)
            }
        });
    }
}).catch(e => {
    console.log('获取获取预设问题失败！', e)
});
document.getElementById('presets').addEventListener('click', () => {
    let doms = document.getElementsByClassName('PresetProblem_box')[0]
    if (doms.style.display == 'none') {
        doms.style.display = 'block'
    } else {
        doms.style.display = 'none'
    }
})
document.getElementById('PresetProblem_none').addEventListener('click', () => {
    document.getElementsByClassName('PresetProblem_box')[0].style.display = 'none'
})
document.getElementById('PresetProblem_list').addEventListener('click', (e) => {
    if (!window.is_speaking) {
        let listenBox = document.getElementsByClassName('listen')[document.getElementsByClassName('listen').length - 1];
        if (listenBox) {
            listenBox.style.display = 'none';
        }
        InsertMessage('user', e.target.innerText)
        COZE_CN_Quiz(e.target.innerText);
        document.getElementsByClassName('PresetProblem_box')[0].style.display = 'none'
    }
})

// 文本输入
document.getElementById('inputState').addEventListener('click', () => {
    let doms = document.getElementsByClassName('input_box')[0]
    if (doms.style.display == 'none') {
        doms.style.display = 'block'
    } else {
        doms.style.display = 'none'
    }
})
// 发送消息的共用函数
function sendMessage() {
    let str = document.getElementById('input_box').value;
    if (!window.is_speaking && str) {
        let listenBox = document.getElementsByClassName('listen')[document.getElementsByClassName('listen').length - 1];
        if (listenBox) {
            listenBox.style.display = 'none';
        }
        InsertMessage('user', str)
        COZE_CN_Quiz(str);
        document.getElementById('input_box').value = '';
        // 发送消息后隐藏输入框
        document.getElementsByClassName('input_box')[0].style.display = 'none';
    }
}

document.getElementById('inputSending').addEventListener('click', sendMessage);

// 添加回车键发送功能
document.getElementById('input_box').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
})

// 获取时间 
let now = new Date();
const Date_box = document.getElementById('Date_box');
let getDate = function () {
    now = new Date();

    Date_box.innerHTML = `
                <div style="font-size: 30px;">
                    ${now.getFullYear()}年${(now.getMonth() + 1).toString().padStart(2, '0')}月${now.getDate().toString().padStart(2, '0')}日
                </div>
                <div style="font-size: 50px;">
                    ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}
                </div>`;
}
getDate();
let timer = setInterval(getDate, 3000);
// 拉流成功后每秒查询一次是否播报状态
let QueryStateTime = null;
let QueryStateIndex = 0
function QueryState() {
    QueryStateTime = setInterval(() => {
        fetch('/avatarhuman/is_speaking', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connection': 'keep-alive',
                'Accept': '*/*'
            },
            body: JSON.stringify({
                sessionid: sessionid
            }),
        }).then(response => {
            if (response.body) {
                let reader = response.body.getReader();
                reader.read().then(function processStream({ done, value }) {
                    let str = new TextDecoder('utf-8').decode(value);
                    if (str) {
                        try {
                            window.is_speaking = JSON.parse(str).data;
                            if (window.is_speaking == false) {
                                QueryStateIndex++;
                                // console.log(QueryStateIndex);
                                if (QueryStateIndex >= 60 && start_recording.style.display != 'none') {
                                    start_recording.style.display = 'inline-block';
                                    document.getElementById('center_operating').style.display = 'none';
                                    // 清屏
                                    document.getElementById('message-list').innerHTML = '';
                                    window.conversation_id = '';
                                }
                            } else {
                                QueryStateIndex = 0
                            }
                            console.log('拉流成功后每秒查询一次是否播报状态', JSON.parse(str).data);
                        } catch (error) {
                            window.is_speaking = true;
                        }
                    }

                });
            }
        }).catch(e => {
            console.log('获取状态失败！', e)
        });
    }, 1000)
}
window.addEventListener('beforeunload', function (event) {
    clearInterval(timer);
    clearInterval(QueryStateTime);
});


// 录制音频
let start_recording = document.getElementById('start');
let end_recording = document.getElementById('end');
let stop_recording = document.getElementById('stop');

// 配置参数
const SILENCE_THRESHOLD = 2.8;    // 静音阈值（根据实际环境调整）
const SILENCE_TIMEOUT = 1500;    // 静音持续时间（毫秒）
const ANALYSER_FFT_SIZE = 2048;

// 全局变量
let IfStart = true;
let defaultAudioContext;
let defaultMediaRecorder;
let defaultAudioChunks = [];
let silenceTimer = null;
let analyser;  // 新增全局分析器引用


let audioIsFetching = false;

function initializeRecorder() {

    try {
        if (audioIsFetching) return; // 防止并发调用
        audioIsFetching = true;
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            setupdefaultAudioContext(stream);
            setupdefaultMediaRecorder(stream);
            startVolumeMonitoring(stream);  // 传递stream参数
        }).catch(error => {
            console.error("获取媒体设备失败:", error);
            audioIsFetching = false; // 出错后也重置状态
        });
    } catch (error) {
        console.error('Error accessing microphone:', error);
    }
}

function setupdefaultAudioContext(stream) {
    defaultAudioContext = new AudioContext();
    const source = defaultAudioContext.createMediaStreamSource(stream);
    analyser = defaultAudioContext.createAnalyser();  // 赋值给全局变量
    analyser.fftSize = ANALYSER_FFT_SIZE;
    source.connect(analyser);
}

function setupdefaultMediaRecorder(stream) {
    defaultMediaRecorder = new MediaRecorder(stream);

    defaultMediaRecorder.ondataavailable = event => {
        defaultAudioChunks.push(event.data);
    };

    defaultMediaRecorder.onstop = () => {
        if (window.is_speaking === false && defaultAudioChunks.length > 0 && IfStart) {
            IfStart = false;
            let audioBlob = new Blob(defaultAudioChunks, { type: defaultMediaRecorder.mimeType });
            AutomaticSpeechRecognition(audioBlob);
            defaultAudioChunks = [];
        }
    };
}

function startVolumeMonitoring(stream) {  // 接收stream参数
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    function checkVolume() {
        analyser.getByteTimeDomainData(dataArray);
        const volume = calculateVolume(dataArray);
        if (window.is_speaking === false) {
            if (volume > SILENCE_THRESHOLD) {
                handleSoundStart();
            } else {
                handleSoundEnd();
            }
        }
        requestAnimationFrame(checkVolume);
    }
    checkVolume();
}

function calculateVolume(dataArray) {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += Math.abs(dataArray[i] - 128);
    }
    // console.log((sum / dataArray.length) * 0.5);
    return (sum / dataArray.length) * 0.5;
}

let states = false;
function handleSoundStart() {
    if (window.is_speaking === false && IfStart && states == false) {
        //defaultMediaRecorder.start();
        if (defaultMediaRecorder.state === 'inactive') {
            defaultMediaRecorder.start();
        } else {
            console.log('MediaRecorder已经在运行或已停止');
        }
        states = true;
        let div = document.createElement('div');
        div.className = 'message_item user listen';
        div.style.display = 'none'
        div.innerHTML = `<img class="message_img" src="./cozechat-s-assets/img/dhr.png" alt=""><div class="message_text">聆听中...</div>`;
        document.getElementById('message-list').appendChild(div);
        document.getElementsByClassName('listen')[document.getElementsByClassName('listen').length - 1].style.display = 'block';
        setTimeout(() => {
            scrollToBottom();
        }, 400)
    }

    if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
    }
}

function handleSoundEnd() {
    if (window.is_speaking === false && !silenceTimer && states) {
        silenceTimer = setTimeout(() => {
            defaultMediaRecorder.stop();
            console.log('检测到静音，停止录音 发送音频数据');
        }, SILENCE_TIMEOUT);
    }
}



// 全局变量----------------------------------------------
let appConfig = {};

// 加载配置
async function loadConfig() {
  try {
    const response = await fetch('/avatarhuman/cozechat-s-assets/config.json');
    appConfig = await response.json();
    console.log('配置加载成功:', appConfig);
  } catch (error) {
    console.error('加载配置文件失败:', error);
    // 设置默认配置以防加载失败
    appConfig = {
      wakeWords: ["小度小度。", "小度小度", "小杜小杜。", "小杜小杜"],
      cozeApi: {
        token: "Bearer sat_7O2pjJ1cbLEfqWmED6czS0oJ7RT24UQcP34YPvk7hCXXKD6xGOmRlTLEzl8CsZm3",
        botId: "7401082582928588841"
      },
      voice: {
        defaultVoiceId: "123.wav"
      }
    };
  }
}

let COZE_Token, COZE_BotId, Keywords, voice_id;
async function init() {
  await loadConfig();
  COZE_Token = appConfig.cozeApi.token;
  COZE_BotId = appConfig.cozeApi.botId;
  Keywords = appConfig.wakeWords;
  voice_id = appConfig.voice.defaultVoiceId;
  console.log("配置文件已加载:", COZE_Token, COZE_BotId, voice_id, Keywords);
}
// 启动初始化
init().catch(console.error);
// ----------------------------------------------


// 按钮点击事件绑定
start_recording.addEventListener('click', () => {
    // document.getElementById('video').muted = false;
    start_recording.style.display = 'none';
    document.getElementById('center_operating').style.display = 'block';

});

// 结束 停止录音 停止播报
end_recording.addEventListener('click', function () {
    start_recording.style.display = 'inline-block';
    document.getElementById('center_operating').style.display = 'none';
    // 退出互动
    InsertMessage('AI Studio', '很高兴为您解答', true);
    // 清屏
    document.getElementById('message-list').innerHTML = '';
});

// 打断
stop_recording.addEventListener('click', function () {
    InsertMessage('AI Studio', '播报停止', true);
});


// 语音识别
function AutomaticSpeechRecognition(file) {
    if (!file) {
        return false
    }
    // 创建一个FormData对象
    const formData = new FormData();
    // 添加表单数据
    formData.append('files', file);
    formData.append('keys', 'string');
    formData.append('lang', 'zh');
    // 发送POST请求
    fetch('/asr/api/v1/asr', {
        method: 'POST',
        headers: {
            // 'Content-Type': 'multipart/form-data',
            // // 'Connection': 'keep-alive',
            // 'Accept': 'application/json'
        },
        body: formData
    }).then(response => response.json()).then(data => {
        const listenElements = document.getElementsByClassName('listen');
        const lastListenElement = listenElements.length > 0 ? listenElements[listenElements.length - 1] : null;

        if (data.result.length > 0 && data.result[0].clean_text && data.result[0].clean_text.length > 1) {
            // 语音唤醒关键词匹配
            if (Keywords.includes(data.result[0].clean_text))  
            // 匹配任意一个关键词时执行的代码
            {
                if (lastListenElement) lastListenElement.style.display = 'none';
                InsertMessage('AI Studio', '你好，我在', false);
                start_recording.style.display = 'none';
                document.getElementById('center_operating').style.display = 'block';
                IfStart = true;
            } else if (start_recording.style.display == 'none') {
                if (lastListenElement) lastListenElement.style.display = 'none';
                InsertMessage('user', data.result[0].clean_text)
                COZE_CN_Quiz(data.result[0].clean_text);

                start_recording.style.display = 'none';
                document.getElementById('center_operating').style.display = 'block';
            } else {
                if (lastListenElement) lastListenElement.style.display = 'none';
                IfStart = true;
            }
        } else {
            IfStart = true;
            if (lastListenElement) lastListenElement.style.display = 'none';
        }
        states = false;
    }).catch(error => console.error(error));
}



// 调用coze
let message = '';
function COZE_CN_Quiz(v) {
    let COZE_URL = 'https://api.coze.cn/v3/chat';
    if (window && window.conversation_id) {
        COZE_URL = `https://api.coze.cn/v3/chat?conversation_id=${window.conversation_id}`
    } else {
        fetch('https://api.coze.cn/v1/conversation/create', {
            method: 'POST',
            headers: {
                'Authorization': COZE_Token,
                'Content-Type': 'application/json',
                'Connection': 'keep-alive',
                'Accept': '*/*'
            },
            body: JSON.stringify({
                bot_id: COZE_BotId
            })
        }).then(response => {
            if (!response.ok) {
                throw new Error('Coze 创建会话 网络响应错误');
            }
            return response.json();
        }).then((res) => {
            if (res.data && res.data.id) {
                window['conversation_id'] = res.data.id;
                COZE_CN_Quiz(v)
            }
            console.log('coze创建会话 ===>', res);
        })
        return false;
    }
    // 注释掉AI回复对话框的创建（保留语音合成功能）
    // let div = document.createElement('div');
    // div.className = 'message_item ai';
    // div.innerHTML = `<img class="message_img" src="./cozechat-s-assets/img/dhl.png" alt=""><div class="message_text Studio">...</div>`;
    // list.appendChild(div);
    message = '';
    // 发送 POST 请求
    fetch(COZE_URL, {
        method: 'POST', // 或者 'GET'
        headers: {
            'Authorization': COZE_Token,
            'Content-Type': 'application/json',
            'Connection': 'keep-alive',
            'Accept': '*/*'
        },
        body: JSON.stringify({
            bot_id: COZE_BotId,
            user_id: "1",
            stream: true,
            auto_save_history: true,
            additional_messages: [
                {
                    role: "user",
                    content: v,
                    content_type: "text"
                }
            ]
        }), // 转换数据为 JSON 格式
        cache: 'no-cache', // 
        credentials: 'same-origin', // 
        redirect: 'follow', // 
        referrerPolicy: 'no-referrer', // 
    }).then(response => {
        if (response.body) {
            let reader = response.body.getReader();
            reader.read().then(function processStream({ done, value }) {
                if (done) {
                    ReceivedText(false);
                    states = false;
                    setTimeout(() => {
                        IfStart = true;
                    },2000)
                    return;
                }
                let str = new TextDecoder('utf-8').decode(value);
                if (str.indexOf('event:conversation.message.delta') > -1) {
                    try {
                        let str_ = str.replace(/event:conversation.message.delta/g, '');

                        let arr = []
                        str_.split('\n').forEach(item => {
                            if (item) {
                                let s = item.split('data:')[1]
                                if (s) {
                                    arr.push(JSON.parse(s))
                                }
                            }
                        })

                        arr.forEach(item => {
                            if (item.type === 'answer') {
                                ReceivedText(item)
                            }
                        })
                    } catch (error) {
                        console.log('文本编译失败！ ==>', error);
                    }
                }
                return reader.read().then(processStream); // 递归读取
            });
        }
    }).catch(e => {
        alert('问题解析失败！')
        console.error(e)
    });
}
let messageLength = '';
let messageState = false
function ReceivedText(v) {
    if (v === false) {
        InsertMessage('AI Studio', messageLength, false);
        messageLength = '';
        messageState = false
    } else {
        message += v.content
        // message += v.content.replace(/\s/g, "")
        if (hasPunctuation(v.content)) {
            messageLength += v.content
            // messageLength += v.content.replace(/\s/g, "");
            InsertMessage('AI Studio', messageLength, false)
            messageLength = ''
            // 注释掉AI回复文本的显示更新
            // setTimeout(() => {
            //     messageState = true;
            //     document.getElementsByClassName('Studio')[document.getElementsByClassName('Studio').length - 1].innerText = message;
            // }, 3000)
        } else {
            messageLength += v.content
            // messageLength += v.content.replace(/\s/g, "")
            if (messageLength.length >= 20 && hasPunctuation(v.content)) {
                InsertMessage('AI Studio', messageLength, false)
                messageLength = ''
            }
            // 注释掉AI回复文本内容的更新
            // document.getElementsByClassName('Studio')[document.getElementsByClassName('Studio').length - 1].innerText = message;
        }

    }
    setTimeout(() => {
        scrollToBottom();
    }, 400)
}
window.COZE_CN_Quiz = COZE_CN_Quiz;
function hasPunctuation(str) {
    return /[，。,;!?]/.test(str);
}


const list = document.getElementById('message-list');
function InsertMessage(type, v, state) {
    if (type === 'user') {
        let div = document.createElement('div');
        div.className = 'message_item user';
        div.innerHTML = `<img class="message_img" src="./cozechat-s-assets/img/dhr.png" alt=""><div class="message_text">${v}</div>`;
        list.appendChild(div);

    } else {
        if (!v) {
            return false
        }

        // 发送消息到后端进行语音合成（保留语音合成功能）
        if (state) {
            // 打断
            fetch('/avatarhuman/human', {
                body: JSON.stringify({
                    text: v,
                    type: 'echo',
                    interrupt: true,
                    sessionid: sessionid,
                    voice_id: voice_id,
                }),
                headers: {
                    'Content-Type': 'application/json'
                },
                method: 'POST'
            });
        } else {
            fetch('/avatarhuman/human', {
                body: JSON.stringify({
                    text: v,
                    type: 'echo',
                    interrupt: false,
                    sessionid: sessionid,
                    voice_id: voice_id,
                }),
                headers: {
                    'Content-Type': 'application/json'
                },
                method: 'POST'
            });
        }
    };
    scrollToBottom()
};


// 列表滚动条
let messageList = document.getElementById('message-list');
function scrollToBottom() {
    messageList.scrollTop = messageList.scrollHeight - messageList.clientHeight;
};

// 视频拉流
var pc = null;
let sessionid = 0
function negotiate() {
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    return pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer);
    }).then(() => {
        // wait for ICE gathering to complete
        return new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(() => {
        var offer = pc.localDescription;
        return fetch('/avatarhuman/offer', {
            body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type,
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then((response) => {
        return response.json();
    }).then((answer) => {
        sessionid = answer.sessionid
        return pc.setRemoteDescription(answer);
    }).catch((e) => {
        // alert(e);
        console.log('视频拉流失败 ==>', e);
        // setTimeout(() => {
        //     PullFlowStart()
        // },3000)
    });
}
const videos = document.getElementById('video');
const audios = document.getElementById('audio');

// 开始视频拉流
function PullFlowStart(ifUseSTUNserver) {
    var config = {
        sdpSemantics: 'unified-plan'
    };
    if (ifUseSTUNserver) {
        // 是否开启 UseSTUNserver
        config.iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
    }
    pc = new RTCPeerConnection(config);
    // connect audio / video
    pc.addEventListener('track', (evt) => {
        if (evt.track.kind == 'video') {
            videos.srcObject = evt.streams[0];
        } else {
            audios.srcObject = evt.streams[0];
        }
    });
    QueryState();
    initializeRecorder();
    document.getElementById('video').muted = false;
    document.getElementById('center_toload').style.display = 'none';
    document.getElementById('start').style.display = 'inline-block';
    negotiate();
}

// 停止视频拉流
function PullFlowStop() {
    document.getElementById('center_toload').style.display = 'block';
    setTimeout(() => {
        if (pc && pc.close) {
            pc.close();
        }
    }, 500);
}

setTimeout(() => {
    PullFlowStart()
}, 3000)

// console.log(`谷歌浏览器实现允许本地跨域访问：
// 创建一个新的文件夹‌：在本地磁盘上创建一个新的文件夹，例如命名为MyChromeDevUserData（文件夹名可以自定义）。
// 修改浏览器快捷方式‌：
// 找到谷歌浏览器的快捷方式，右键点击属性。
// 在“快捷方式”选项卡下，找到“目标”字段。
// 在目标字段的末尾添加以下参数以禁用同源策略并指定用户数据目录：空格加 --disable-web-security --user-data-dir=路径\MyChromeDevUserData。
// 其中路径应替换为你在第1步中创建的文件夹的实际路径。
// ‌启动浏览器‌：保存快捷方式的修改后，重新启动浏览器。你应该会看到一个提示，表明你正在使用不受支持的命令行标记--disable-web-security，这表示浏览器已经配置为允许跨域访问。
// 通过上述步骤，你可以在本地开发环境中绕过浏览器的同源策略限制，从而允许跨域访问`);
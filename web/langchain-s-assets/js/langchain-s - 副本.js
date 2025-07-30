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
document.getElementById('inputSending').addEventListener('click', () => {
    let str = document.getElementById('input_box').value;
    if (!window.is_speaking && str) {
        let listenBox = document.getElementsByClassName('listen')[document.getElementsByClassName('listen').length - 1];
        if (listenBox) {
            listenBox.style.display = 'none';
        }
        InsertMessage('user', str)
        COZE_CN_Quiz(str);
        document.getElementById('input_box').value = '';
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
        div.innerHTML = `<img class="message_img" src="./langchain-s-assets/img/dhr.png" alt=""><div class="message_text">聆听中...</div>`;
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
    // 停止播报
    InsertMessage('AI Studio', '互动结束', true);
    // 清屏
    document.getElementById('message-list').innerHTML = '';
});

// 打断
stop_recording.addEventListener('click', function () {
    InsertMessage('AI Studio', '播报停止', true);
});


// 语音识别
const keywords = ['小度小度。', '小度小度', '小杜小杜。', '小杜小杜']; // 唤醒词
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
            if (keywords.includes(data.result[0].clean_text)) {
                if (lastListenElement) lastListenElement.style.display = 'none';
                InsertMessage('AI Studio', '您好，我在', false);
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

// 向coze对应的bot发送接口请求
let COZE_Token = `Bearer pat_1kKSq7RFVQQCJFQh1Ni0tigyOwzXcac9mwT5nSHQodW4v3IDYAkLDWVWn2tYHt05`;
let COZE_BotId = `7401082582928588841`;
let message = '';
function COZE_CN_Quiz(v) {
    let div = document.createElement('div');
    div.className = 'message_item ai';
    div.innerHTML = `<img class="message_img" src="./langchain-s-assets/img/dhl.png" alt=""><div class="message_text Studio">...</div>`;
    list.appendChild(div);
    message = '';
    // 发送 POST 请求
    fetch('/llm/chat/kb_chat', {
        method: 'POST', // 或者 'GET'
        headers: {
            'Content-Type': 'application/json',
            'Connection': 'keep-alive',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            query: v,
            mode: "local_kb",
            kb_name: "test3",
            top_k: 3,
            score_threshold: 2,
            history: [
                {
                    content: "你是一个客服，请回答用户问题",
                    role: "user"
                }, {
                    content: "明白了",
                    role: "assistant"
                }
            ],
            stream: true,
            model: "qwen1.5-chat",
            temperature: 0.5,
            max_tokens: 0,
            prompt_name: "default",
            return_direct: false
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
                    }, 2000)
                    return;
                }
                let str = new TextDecoder('utf-8').decode(value);
                try {
                    if (str && str.length > 0) {
                        let obj = JSON.parse(str.split('data: ')[1]);
                        if (obj.choices && obj.choices[0] && obj.choices[0].delta) {
                            ReceivedText(obj.choices[0].delta)
                        }

                    } else {
                        ReceivedText(false);
                        states = false;
                        setTimeout(() => {
                            IfStart = true;
                        }, 2000)
                        return;
                    }
                } catch (error) {
                    // ReceivedText(false);
                    console.log('文本编译失败！ ==>', error);
                }
                return reader.read().then(processStream); // 递归读取

            });
        }
    })
        .catch(e => {
            alert('问题解析失败！')
            console.error(e)
        });
}
let messageState = false
function ReceivedText(v) {
    if (v === false) {
        messageState = false;
        if (buffer) {
			InsertMessage('AI Studio', buffer, false);
        }
    } else {
        // message += v.content.replace(/\s/g, "")
        message += v.content;
        hasPunctuation(v.content,(text) => {
            InsertMessage('AI Studio', text, false);
            document.getElementsByClassName('Studio')[document.getElementsByClassName('Studio').length - 1].innerText = message;
        })
    }
    setTimeout(() => {
        scrollToBottom();
    }, 400)
}
window.COZE_CN_Quiz = COZE_CN_Quiz;
const punctuation = /[。？！!?；;,，]/; // 匹配标点符号
let buffer = '';
function hasPunctuation(text, callback) {
    for (let i = 0; i < text.length; i++) {
        buffer += text[i];
        // 检查缓冲区是否包含标点符号
        let match = buffer.match(punctuation);
        if (match) {
            let puncIndex = buffer.indexOf(match[0]);
            // 提取完整句子（从开头到标点符号）
            let sentence = buffer.substring(0, puncIndex + 1);
            buffer = buffer.substring(puncIndex + 1);
            console.log('buffer',buffer)
            // 回调处理完整的句子
            callback(sentence);
        }
    }
}

const list = document.getElementById('message-list');
function InsertMessage(type, v, state) {
    if (type === 'user') {
        let div = document.createElement('div');
        div.className = 'message_item user';
        div.innerHTML = `<img class="message_img" src="./langchain-s-assets/img/dhr.png" alt=""><div class="message_text">${v}</div>`;
        list.appendChild(div);

    } else {
        if (!v) {
            return false
        }

        // 发送消息
        if (state) {
            // 打断
            fetch('/avatarhuman/human', {
                body: JSON.stringify({
                    text: v,
                    type: 'echo',
                    interrupt: true,
                    sessionid: sessionid,
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
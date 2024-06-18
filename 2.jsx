import React, { useRef, useEffect, useState } from 'react'
import scanAudio from "../assets/scanVoice.mp3";
import { getCookie, getUUID } from '../utils/utils'
import { animate } from "../utils/animate"
import { uploadImage, getOcrInfo } from './common'

const token = localStorage.getItem('token') || getCookie("bcssToken")

const Scan = props => {
	const { closeScan, count, openAudio, onSuccess, closeScanHandle } = props
	const [showToast, setShowToast] = useState(false)
	const [toastMsg, setToastMsg] = useState('')
	const videoRef = useRef(null);
	const canvasRef = useRef(null);
	const scanLineRef = useRef(null);
	const scanAreaRef = useRef(null);
	const ocrInfoList = useRef([])
	const scanAudioContext = useRef(null)
	const scanAudioBuffer = useRef(null) // 音频buffer
	const timer = useRef(true)
	const lineTimer = useRef(true)
	let animationFrame

	useEffect(() => {
		handleScan();
		moveScanLine(); // 移动扫描线
		// 加载音频
		if (openAudio) {
			scanAudioContext.current = new (window.AudioContext || window.webkitAudioContext)()
			scanVoiceLoad();
		}
		return () => {
			closeVideo()
		}
	}, [])

	const handleScan = () => {
		if (!navigator.mediaDevices && !navigator.mediaDevices.getUserMedia) {
			Toast('调用摄像头失败')
			return
		}

		// 第一次申请权限获取设备列表信息
		navigator.mediaDevices.getUserMedia({
			video: {
				width: 480,
				height: 320
			},
			audio: false
		}).then((stream) => {
			getDeviceListScan()
			stopStream(stream)
		})
	}
	/**
	 * @description 获取设备后置摄像头列表，并调用持续拍摄
	 */
	const getDeviceListScan = () => {
		navigator.mediaDevices.enumerateDevices().then(res => {
			const deviceList = []
			res.map(item => {
				if(item.deviceId && item.kind === 'videoinput' && item.label.indexOf('front') === -1 && item.label.indexOf('前置') === -1){
					deviceList.push({
						deviceId: item.deviceId,
						label: item.label
					})
				}
			})
			openCamera(deviceList)
		})
	}

	const openCamera = list => {
		if(list.length === 0) {
			return
		}
		// 倒序调用摄像头 主摄在最后一个
		const { deviceId } = list.pop() || {}

		navigator.mediaDevices.getUserMedia({ 
			audio: false,
			video: {
				deviceId: { exact: deviceId },
				width: { ideal: 1280 },
				height: { ideal: 720},
				facingMode: 'environment', // 后置摄像头
			}
		})
		.then(stream => {
			handler(stream)
		}).catch(() => {
			if(list.length === 0){
				Toast('调用摄像头失败')
				return
			}
			openCamera(list)
		})
	}


	const handler = stream => {
		const target = videoRef.current

		if (target.srcObject !== undefined) {
			target.srcObject = stream
		} else if (window.URL.createObjectURL) {
			target.src = window.URL.createObjectURL(stream)
		} else if (window.webkitURL) {
			target.src = window.webkitURL.createObjectURL(stream)
		} else {
			target.src = stream
		}
		target.Inline = true
		const videoPromise = target.play()
		Toast('请将身份证人像对准扫描框')
        videoPromise.then(playVideoAnimation())
	}

	const Toast = (msg) => {
		setShowToast(true)
		setToastMsg(msg)
		setTimeout(() => {
			setShowToast(false)
		}, 2000)
	}

	// 释放视频流
	const stopStream = (stream) => {
		if (stream) {
			stream.getTracks().forEach(function (track) {
				track.stop();
			});
		}
	}

	const moveScanLine = () => {
		const { offsetTop } = scanLineRef.current
		const { bottom } = scanAreaRef.current.getBoundingClientRect()
		animate(offsetTop, bottom - 20, 3000, value => {
			if (scanLineRef.current) {
				scanLineRef.current.style.top = value + 'px'
			}
		});

		// 当动画结束时，将线移动到起始位置并开始新的动画
		let timer = setTimeout(() => {
			if (!lineTimer.current) {
				return
			}
			lineTimer.current = timer
			scanLineRef.current.style.top = '180px'
			moveScanLine();
		}, 3000);
	}
	/**
	 * @description 抓取图片
	 */
	const repeatTakeFrame = () => {
		const viewportWidth = window.innerWidth
		//截图定位点
		let points = {
			startX: viewportWidth * 0.05,
			startY: 200,
		}
		try {
			cutImg(videoRef.current, points, canvasRef.current).then(res => {
				if (res) {
					playScanAudio()
					uploadImage(res, token).then(id => {
						getOcrInfo(id, token).then(res => {
							const { errMessage, data: ocrInfo = {} } = res || {}
							if (ocrInfo) {
								onSuccess(ocrInfo, (msg) => {
									ocrInfoList.current.push(ocrInfo)
									Toast(msg || '识别成功')
								})
							} else {
								Toast('识别失败')
							}
						})
					})
				}

			})
		} catch (error) {
			Toast('识别失败')
			repeat()
		}
		playVideoAnimation()
	}

	const playVideoAnimation = () => {
		// 检查是否扫描完
		if (checkOcrDone()) {
			cancelAnimationFrame(animationFrame)
			return
		}
		animationFrame = requestAnimationFrame(repeatTakeFrame)
	}

	/**
	 * @description 裁剪图片
	 */
	const cutImg = (nodeParam, points, canvasDom) => {
		return new Promise((resolve) => {
			// 获取 图片/视频高度和宽度，需要和视口比例做匹配，canvas绘制时根据 图片/视频 的原高和宽进行裁剪
			const originWidth = nodeParam.naturalWidth || nodeParam.videoWidth;

			const { startX = 0, startY = 0 } = points || {};

			let context = canvasDom.getContext('2d');
			// 裁剪后图片的高度，身份证宽高比为1.58，上下识别区域多20%
			const outputHeight = originWidth / (1.58 * 0.8)
			canvasDom.width = originWidth;
			canvasDom.height = outputHeight;

			context.drawImage(nodeParam, startX, startY * 0.9, originWidth, outputHeight, 0, 0, originWidth, outputHeight);
			
			// 将裁剪后的图片转换为文件流
			canvasDom.toBlob(function (blob) {
				context = null
				blob.lastModifiedDate = new Date()
				const file = new File([blob], getUUID(8, 16) + '.jpg', { type: 'image/jpeg' })
				resolve(file)
			}, "image/jpeg");
		})
	}

	/**
	 * @description 关闭扫描
	 */
	const close = e => {
		e && e.stopPropagation()
		ocrInfoList.current = []
		clearTimeout(timer.current)
		timer.current = null
		clearTimeout(lineTimer.current)
		lineTimer.current = null
		if (scanAudioContext.current) {
			scanAudioContext.current.close() // 销毁音频context
			scanAudioContext.current = null
		}
		closeVideo()
		closeScan && closeScan()
		closeScanHandle && closeScanHandle()
	}

	const closeVideo = () => {
		const video = videoRef.current;
		stopStream(video.srcObject)
		video.srcObject = null
	}
	/**
	 * @description 检查扫描是否完成
	 */
	const checkOcrDone = () => {
		if (count && ocrInfoList.current.length === count) {
			close()
			return true
		}
		// 未传count限制数量可以一直扫
		return false
	}

	/**
	 * @description 扫描语音播报
	 * @param {Object} infoList 扫描信息
	 */
	const scanVoiceLoad = () => {
		const context = scanAudioContext.current
		// 加载音频数据
		fetch(scanAudio)
			.then(response => {
				if (response.ok) {
					// 返回ArrayBuffer
					return response.arrayBuffer();
				}
			})
			.then(arrayBuffer => {
				// 解码ArrayBuffer为AudioBuffer
				return context.decodeAudioData(arrayBuffer);
			})
			.then(audioBuffer => {
				scanAudioBuffer.current = audioBuffer
			});
	}

	/**
	 * @description 播放扫描提示音 di
	 * @param {Object} buffer 音频buffer
	 */
	const playScanAudio = () => {
		let context = scanAudioContext.current
		const source = context.createBufferSource()
		source.buffer = scanAudioBuffer.current;
		source.connect(context.destination);
		// 设置loop为false，让音频只播放一次
		source.loop = false;
		// 开始播放 
		source.start();
		source.addEventListener('ended', () => {
			// 停止并释放源节点
			source.stop();
			source.disconnect();
		})
	}

	return (
		<div className="bcss-component_selectPop-scan">
			<span className="selectPop-scan-close" onClick={close}></span>
			<span ref={scanLineRef} className="selectPop-scan-line"></span>
			<div ref={scanAreaRef} className="selectPop-scan-area"></div>
			<video ref={videoRef} muted playsInline x5-playsinline="true" webkit-playsinline="true"></video>
			<canvas ref={canvasRef}></canvas>
			{showToast && <div className="toast">{toastMsg}</div>}
		</div>
	)
}

export default Scan
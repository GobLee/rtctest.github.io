import React, { useState, useRef, useEffect } from 'react'
import ReactDOM from "react-dom"
import { getUUID, getCookie, validateIsImage } from '../utils/utils';
import { cutImg } from './common'
import Scan from './scan'
import workerCode from './worker'

const FILE_URL = `${location.origin}/file/uploadOneFilewithEapid`
const OCR_URL = `${location.origin}/api-trip/idCardOcr/ocrProcess`

const CUT_IMG_TOP = 0.1
const CUT_IMG_BOTTOM = 0.9

const SelectPop = props => {
    const { visible, closeSelectPop, count, onSuccess, uploadSuccess, openAudio, closeScanHandle, beforeUpload, ocrText } = props
    const [showScan, setShowScan] = useState(false)
    const [showToast, setShowToast] = useState(false)
    const [toastMsg, setToastMsg] = useState('')
    const ocrInfoList = useRef([])
    const canvasRef = useRef(null)
    const inputRef = useRef(null)
    const token = localStorage.getItem('token') || getCookie("bcssToken")
    const weakmap = new WeakMap();

    useEffect(() => {
        inputRef.current.addEventListener('click', function(event) {
            event.stopPropagation();
        });
    }, [])

    const closePop = e => {
        e.stopPropagation()
        closeSelectPop()
    }

    const contentClick = e => {
        e.stopPropagation()
    }

    // 从相册选择图片
    const selectFromAlbum = e => {
        inputRef.current.click()
    }

    // 拍照
    const takePhoto = () => {
        closeSelectPop()
        setShowScan(true)
    }

    const closeScan = () => {
        setShowScan(false)
    }

    // 组件返回识别信息
    const handleBackInfo = (data, num) => {
        ocrInfoList.current.push(data)
        if(ocrInfoList.current.length >= num){
            uploadSuccess && uploadSuccess(ocrInfoList.current)
            ocrInfoList.current = []
            closeSelectPop()
        }
    }
    /**
     * @description 相册图片裁剪
     */
    const handleFile = file => {
        return new Promise((resolve) => {
            const fileType = file.type || 'image/jpeg'
            const fileName = file.name || (getUUID(8, 16) + fileType.split('/')[1])
            // 创建一个FileReader实例
            const reader = new FileReader();

            // 读取文件并将其转换为data URL
            reader.onload = function(e) {
                const dataURL = e.target.result;

                // 创建一个Image对象，加载data URL
                const img = new Image();
                img.onload = function() {
                    let points = {
                        startX: 0,
                        startY: CUT_IMG_TOP,
                        endX: 1,
                        endY: CUT_IMG_BOTTOM 
                    }	
                    // 裁剪图片
                    cutImg(img, points, canvasRef.current, { name: fileName, type: fileType}).then(res => {
                        resolve(res)
                    })
                };
                img.src = dataURL;
            };
            reader.readAsDataURL(file);
        })
    }

    const Toast = (msg) => {
		setShowToast(true)
		setToastMsg(msg)
		setTimeout(() => {
			setShowToast(false)
		}, 2000)
	}

    const handleUpload = e => {
        getUploadOcrInfo(e)
        e.target.value = ''
    }

    const getUploadOcrInfo = (e) => {
        const data = e && e.target && e.target.files || []
        const files = [...data]
        const fileNum = count || 9
        // 上传数量校验
        if(fileNum && files && files.length > fileNum) {
            Toast(`上传数量不得大于${fileNum}`)
            return
        }
        // 上传类型校验-正则
        if(files.find(item => !validateIsImage(item.name))){
            Toast('只支持.jpg,.jpeg,.bmp,.gif,.png类型文件!')
            return
        }
        // 文件大小校验
        if(files.find(item => item.size > 3 * 1024 * 1024 )){
            Toast('图片大小最大支持3M')
            return
        }
        closeSelectPop && closeSelectPop()
        beforeUpload && beforeUpload()
        files.forEach(item => {
            // 创建一个Blob对象
            let blob = new Blob([workerCode], {type: "application/javascript"});

            // 将Blob对象转换为URL
            let url = URL.createObjectURL(blob);

            // 创建一个新的Worker
            let worker = new Worker(url, {type: 'module'});
            const requestId = getUUID(8, 16)
            weakmap.set(worker, requestId);
            handleFile(item).then(res => {
                worker.postMessage({requestId, fileData: res, token, fileUrl: FILE_URL, ocrUrl: OCR_URL});
            })
            worker.onmessage = msg => {
                const { data: { res } = {} } = msg || {}
                const { data: ocrInfo = null } = res || {}
                worker.terminate()
                handleBackInfo(ocrInfo, files.length)
            }
            worker.onerror = (e) => {
                worker.terminate()
                handleBackInfo(null, files.length)
            }
        })

    }

    const params = {
        closeScan,
        count,
        onSuccess,
        openAudio,
        closeScanHandle
    }

    const { photoText = '拍摄', albumText = '相册' } = ocrText || {}

    return (
        <React.Fragment>
        <span className={`bcss-component_selectPop  ${visible === true ? "bcss-component_appear" : (visible === false ? "bcss-component_disappear" : "")}`} onClick={closePop}>
            <span className={`bcss-component_selectPop-content ${visible === true ? "bcss-component_contentappear" : (visible === false ? "bcss-component_contentdisappear" : "")}`} onClick={contentClick}>
                <div className='bcss-component_selectPop-select-item' onClick={takePhoto}>{photoText}</div>
                <div className='bcss-component_selectPop-select-item' onClick={selectFromAlbum}>{albumText}</div>
                <div className='bcss-component_selectPop-select-item' onClick={closePop}>取消</div>
            </span>
            <input ref={inputRef} type="file" multiple={count !== 1} hidden accept="image/*" onchange={handleUpload}/>
            <canvas ref={canvasRef}></canvas>
            {showToast && <div className="toast">{toastMsg}</div>}
        </span>
        {showScan && ReactDOM.createPortal(
            <Scan {...params}></Scan>,
            document.body
        )}
        </React.Fragment>)
}

const Ocr = props => {
    // count 数量限制，已选
    const { count, onSuccess, clickIcon = null, uploadSuccess, openAudio = true, closeScanHandle, beforeUpload, ocrText  } = props 
    const [visible, setVisible] = useState(undefined) // 设置undefined selectPop动画
    
    const showSelectPop = () => {
        setVisible(true)
    }

    const closeSelectPop = () => {
        setVisible(false)
    }

    const params = {
        visible,
        closeSelectPop,
        count,
        openAudio,
        onSuccess,
        uploadSuccess,
        closeScanHandle,
        beforeUpload,
        ocrText
    }

    return (
        <div className="ocr-container" onClick={showSelectPop}>
            {clickIcon || <svg fill="red" viewBox="0 0 44 44" width="100%" height="100%">
                <path d="M29.7352369,5 L29.7352369,5 C30.8779691,5 31.9107146,5.6794308 32.3609512,6.72709926 L33.6600003,9.74999944 L38.2857146,9.74999944 L38.2857143,9.74999944 C41.441625,9.74999931 44,12.301973 44,15.449997 L44,37.3000024 L44,37.3000024 C44,40.448022 41.441625,43 38.2857143,43 L9.71428593,43 L9.71428568,43 C6.55837498,43 4,40.448022 4,37.3000024 C4,37.3000024 4,37.3000024 4,37.3000024 L4,15.449997 L4,15.4499979 C4,12.3019783 6.55837052,9.7500003 9.71428568,9.7500003 L14.3399999,9.7500003 L15.639049,6.72710012 L15.6390488,6.72710065 C16.0892854,5.67942774 17.1220309,5 18.2647631,5 L29.7352541,5 L29.7352369,5 Z M29.6874418,8 L18.3125379,8 L16.2885949,12.7058932 L9.8333318,12.7058932 L9.83333193,12.7058932 C8.33302878,12.7058098 7.09273709,13.8712377 7.00472224,15.3637716 L7,15.5294187 L7,37.1764725 L7,37.1766294 C7,38.6717398 8.16954247,39.9076725 9.66726906,39.9953033 L9.83333427,40 L38.1666681,40 L38.1666681,40 C39.6669712,40 40.9072629,38.8346555 40.9952778,37.3421215 L41,37.1764745 L41,15.5294206 L41,15.5292634 C41,14.034153 39.8304575,12.7982203 38.3327309,12.7105895 L38.1666662,12.7058928 L31.711403,12.7058928 L29.68746,8 L29.6874418,8 Z M24.5,16 C29.7468582,16 34,20.2531552 34,25.5 C34,30.7468582 29.7468448,35 24.5,35 C19.2531418,35 15,30.7468448 15,25.5 C15,20.2531418 19.2531552,16 24.5,16 Z M24.5,19 L24.5,19 C20.9101422,19 18,21.9101552 18,25.5 C18,29.0898579 20.9101552,32 24.5,32 L24.5,32 C28.0898578,32 31,29.0898448 31,25.5 C31,21.9101421 28.0898448,19 24.5,19 L24.5,19 Z M36.5,15 L36.5,15 C37.3284266,15 38,15.6715734 38,16.5 C38,17.3284266 37.3284266,18 36.5,18 L36.5,18 C35.6715734,18 35,17.3284266 35,16.5 C35,15.6715734 35.6715734,15 36.5,15 L36.5,15 Z"></path>
            </svg>}
            {ReactDOM.createPortal(
                <SelectPop {...params}/>,
                document.body
            )}
        </div>
    )
}

export default Ocr
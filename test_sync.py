import cv2
url = "rtsp://user:pass@192.168.1.100:554/stream"
cap = cv2.VideoCapture(url)  # Windows 下若有问题可尝试 cv2.CAP_FFMPEG or cv2.CAP_DSHOW
print("opened:", cap.isOpened())
ret, frame = cap.read()
print("read ok:", ret)
if ret:
    print(frame.shape)
cap.release()

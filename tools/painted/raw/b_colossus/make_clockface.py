#!/usr/bin/env python3
"""clock_a.webp → clockface_a.webp : 그림에 박힌 시곗바늘(12시·2시)과 중심 축을 지운다 (cv2 인페인트).
런타임이 로직 값(clockH/clockM)으로 바늘을 그리므로 그림 속 고정 바늘은 지워야 한다. 숫자 XII·II 는 건드리지 않는다.
사용: python3 tools/painted/raw/b_colossus/make_clockface.py   (결과는 같은 폴더, 설정 configs/b_colossus.json 의 clock 부품이 사용)"""
import os
import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
im = np.asarray(Image.open(os.path.join(HERE, 'clock_a.webp')).convert('RGB'))
mask = np.zeros(im.shape[:2], np.uint8)
cv2.fillPoly(mask, [np.array([(679, 566), (707, 566), (712, 762), (674, 762)], np.int32)], 255)          # 분침 (XII 아래까지만)
cv2.fillPoly(mask, [np.array([(696, 770), (716, 796), (896, 704), (894, 640), (832, 624), (810, 650)], np.int32)], 255)   # 시침 + 화살촉
cv2.circle(mask, (693, 779), 46, 255, -1)                                                                        # 중심 축
mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
out = cv2.inpaint(np.ascontiguousarray(im[..., ::-1]), mask, 9, cv2.INPAINT_TELEA)[..., ::-1]
Image.fromarray(out).save(os.path.join(HERE, 'clockface_a.webp'), quality=95)
print('clockface_a.webp', out.shape)

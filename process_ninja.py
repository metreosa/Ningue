from PIL import Image
import numpy as np

img = Image.open('assets/ninja_avatar_original.png').convert('RGBA')
arr = np.array(img)

# Assuming the background color is the color of the top-left pixel
bg_color = arr[0, 0]

# Calculate color distance
distance = np.sqrt(np.sum((arr[:, :, :3] - bg_color[:3]) ** 2, axis=-1))

# Threshold for distance
mask = distance > 20

# Create a transparent image
out_arr = np.zeros_like(arr)
out_arr[mask] = arr[mask]

out_img = Image.fromarray(out_arr)

# Crop the bounding box of non-transparent pixels
bbox = out_img.getbbox()
if bbox:
    out_img = out_img.crop(bbox)

out_img.save('assets/ninja_avatar.png')
print("Saved ninja_avatar.png")

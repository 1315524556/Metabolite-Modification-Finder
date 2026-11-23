# -*- coding: utf-8 -*-
"""
Created on Mon Mar 25 10:56:29 2024

@author: WW
"""

import pandas as pd

# 读取Excel表格
df_negative = pd.read_excel("Negative.xlsx")
df_substrate = pd.read_excel("Substrate-neg.xlsx")
df_modification = pd.read_excel("Modification List.xlsx")

# 定义阈值ppm
ppm_threshold = 10

# 创建一个空列表
output_list = []

# 循环比较Substrate.xlsx中m/z列和Negative.xlsx中m/z列的差值
for index_sub, row_sub in df_substrate.iterrows():
    for index_neg, row_neg in df_negative.iterrows():
        diff1 = abs(row_sub['m/z'] - row_neg['m/z'])
        
        # 嵌套循环比较差值1和Modification List.xlsx中m/z列的差值
        for index_mod, row_mod in df_modification.iterrows():
            diff2 = abs(diff1 - row_mod['m/z'])
            ppm = (diff2 / row_mod['m/z']) * 1000000
            
            # 判断是否满足阈值ppm
            if ppm <= ppm_threshold:
                output_data = {
                    "Substrate_NO": row_sub['NO'],
                    "Substrate_Name": row_sub['Name'],
                    "Substrate_m/z": row_sub['m/z'],
                    "Substrate_RT [min]": row_sub['RT [min]'],
                    "Negative_NO": row_neg['NO'],
                    "Negative_Name": row_neg['Name'],
                    "Negative_m/z": row_neg['m/z'],
                    "Negative_RT [min]": row_neg['RT [min]'],
                    "Modification_Type": row_mod['Modified Type'],
                    "Neutral_Loss": row_mod['Neutral Loss'],
                    "Modification_m/z": row_mod['m/z']
                }
                
                # 将每次符合条件的数据添加到列表中
                output_list.append(output_data)

# 将列表转换成DataFrame
df_output = pd.DataFrame(output_list)

# 输出到新的Excel表
df_output.to_excel("Neg-统计结果-10ppm.xlsx", index=False)
import React, { ReactElement } from 'react'
import { Box } from '@mui/material'

export type NestedListItem = { element: ReactElement, children?: NestedListItem[], renderChildren?: boolean }
type NestedListProps = { items: NestedListItem[], level?: number, levelColors?: string[] }
const blue = '#1976d2';
const green = '#76d275';
const orange = '#ffa726';
const purple = '#ab47bc';
const defaultLevelColors = [blue, green, orange, purple];

export const NestedList = ({ items, level, levelColors }: NestedListProps) => {
  const isRoot = typeof level === 'undefined';
  const resolvedLevel = level ? level : 0;
  const resolvedLevelColors = levelColors ? levelColors : defaultLevelColors;
  const flattenedItems = flattenItems(items);

  function flattenItems(items: NestedListItem[]): (NestedListItem|NestedListItem[])[] {
    const flattened = [];
    for (const item of items) {
      flattened.push(item);
      if (item.children && (item.renderChildren || typeof item.renderChildren === 'undefined'))
        flattened.push(item.children);
    }

    return flattened;
  }

  return (
    <Box 
      component='ul' 
      sx={{ 
        padding: isRoot ? 0 : undefined,
        margin: isRoot ? 0 : undefined,
      }}
    >
      {
        flattenedItems.map((item, index) => (Array.isArray(item)) ?
          <NestedList 
            key={index} 
            items={item} 
            level={resolvedLevel + 1} 
          />
          :
          <Box
            key={index}
            component='li'
            sx={(theme) => ({
              borderLeft: 3,
              borderLeftColor: resolvedLevelColors[resolvedLevel%resolvedLevelColors.length],
              listStyleType: 'none',
              marginTop: !(isRoot && index == 0) ? theme.spacing(1) : undefined,
            })}
          >
            {item.element}
          </Box>
        )
      }
    </Box>
  );
}

import React from 'react'

interface TableProps {
  children: React.ReactNode
  style?: React.CSSProperties
}

interface TableHeaderProps {
  children: React.ReactNode
  bgColor?: string
  borderColor?: string
  textColor?: string
  style?: React.CSSProperties
}

interface TableRowProps {
  children: React.ReactNode
  bgColor?: string
  borderColor?: string
  style?: React.CSSProperties
}

interface TableCellProps {
  children: React.ReactNode
  align?: 'left' | 'center' | 'right'
  colSpan?: number
  rowSpan?: number
  fontWeight?: 'normal' | '600' | '700'
  style?: React.CSSProperties
}

export const Table: React.FC<TableProps> = ({ children, style }) => {
  return (
    <div style={{ overflowX: 'auto', ...style }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        {children}
      </table>
    </div>
  )
}

export const TableHeader: React.FC<TableHeaderProps> = ({ 
  children, 
  bgColor = '#f3f4f6', 
  borderColor = '#d1d5db',
  textColor = '#1f2937',
  style 
}) => {
  return (
    <thead>
      <tr style={{ 
        background: bgColor, 
        borderBottom: `2px solid ${borderColor}`,
        ...style 
      }}>
        {children}
      </tr>
    </thead>
  )
}

export const TableRow: React.FC<TableRowProps> = ({ 
  children, 
  bgColor, 
  borderColor = '#e5e7eb',
  style 
}) => {
  return (
    <tr style={{ 
      borderBottom: `1px solid ${borderColor}`,
      ...(bgColor && { background: bgColor }),
      ...style 
    }}>
      {children}
    </tr>
  )
}

export const TableCell: React.FC<TableCellProps> = ({ 
  children, 
  align = 'left',
  colSpan,
  rowSpan,
  fontWeight = 'normal',
  style 
}) => {
  return (
    <td 
      colSpan={colSpan}
      rowSpan={rowSpan}
      style={{ 
        padding: '12px',
        textAlign: align,
        fontWeight,
        color: '#374151',
        border: '1px solid #e5e7eb',
        ...style 
      }}
    >
      {children}
    </td>
  )
}

export const TableHeaderCell: React.FC<TableCellProps> = ({ 
  children, 
  align = 'left',
  colSpan,
  rowSpan,
  fontWeight = '700',
  textColor = '#1f2937',
  style 
}) => {
  return (
    <th 
      colSpan={colSpan}
      rowSpan={rowSpan}
      style={{ 
        padding: '12px',
        textAlign: align,
        fontWeight,
        color: textColor,
        border: '1px solid #e5e7eb',
        ...style 
      }}
    >
      {children}
    </th>
  )
}


import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Modal,
  SafeAreaView,
  FlatList,
  Platform,
  StatusBar,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

export interface DropdownItem {
  id: string;
  label: string;
  subLabel?: string;
}

interface Props {
  label: string;
  placeholder?: string;
  items: DropdownItem[];
  selectedId?: string;
  selectedIds?: string[];
  multiSelect?: boolean;
  onSelect?: (id: string) => void;
  onSelectMultiple?: (ids: string[]) => void;
  onAddNew?: () => void;
  addNewLabel?: string;
  tagColor?: 'blue' | 'emerald' | 'amber' | 'purple';
  required?: boolean;
}

export function SearchDropdown({
  label,
  placeholder = 'Select option...',
  items,
  selectedId = '',
  selectedIds = [],
  multiSelect = false,
  onSelect,
  onSelectMultiple,
  onAddNew,
  addNewLabel,
  tagColor = 'blue',
  required = false,
}: Props) {
  const { themeColors, isDark } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter(
      (item) =>
        (item.label && item.label.toLowerCase().includes(q)) ||
        (item.subLabel && item.subLabel.toLowerCase().includes(q))
    );
  }, [items, searchQuery]);

  // Selected item object for single select
  const selectedItem = useMemo(() => {
    if (multiSelect || !selectedId) return null;
    return items.find((i) => i.id === selectedId) || null;
  }, [items, selectedId, multiSelect]);

  // Selected items objects for multi select
  const selectedItemsList = useMemo(() => {
    if (!multiSelect || selectedIds.length === 0) return [];
    return items.filter((i) => selectedIds.includes(i.id));
  }, [items, selectedIds, multiSelect]);

  const handleToggleItem = (id: string) => {
    if (multiSelect) {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id];
      onSelectMultiple?.(next);
    } else {
      onSelect?.(id);
      setModalVisible(false);
      setSearchQuery('');
    }
  };

  const handleRemoveItem = (id: string) => {
    if (multiSelect) {
      onSelectMultiple?.(selectedIds.filter((x) => x !== id));
    } else {
      onSelect?.('');
    }
  };

  const tagColors = {
    blue: {
      bg: isDark ? 'rgba(37, 99, 235, 0.25)' : '#EFF6FF',
      text: isDark ? '#93C5FD' : '#1D4ED8',
      border: isDark ? '#1D4ED8' : '#BFDBFE',
    },
    emerald: {
      bg: isDark ? 'rgba(5, 150, 105, 0.25)' : '#ECFDF5',
      text: isDark ? '#6EE7B7' : '#047857',
      border: isDark ? '#047857' : '#A7F3D0',
    },
    amber: {
      bg: isDark ? 'rgba(217, 119, 6, 0.25)' : '#FFFBEB',
      text: isDark ? '#FCD34D' : '#B45309',
      border: isDark ? '#B45309' : '#FDE68A',
    },
    purple: {
      bg: isDark ? 'rgba(147, 51, 234, 0.25)' : '#FAF5FF',
      text: isDark ? '#D8B4FE' : '#6B21A8',
      border: isDark ? '#6B21A8' : '#E9D5FF',
    },
  }[tagColor];

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: themeColors.text }]}>
        {label.toUpperCase()} {required && <Text style={{ color: '#EF4444' }}>*</Text>}
      </Text>

      {/* Selector Trigger Input */}
      <TouchableOpacity
        style={[
          styles.triggerBox,
          {
            backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
            borderColor: isDark ? '#334155' : '#CBD5E1',
          },
        ]}
        onPress={() => {
          setSearchQuery('');
          setModalVisible(true);
        }}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          {!multiSelect ? (
            selectedItem ? (
              <View style={styles.singleSelectedRow}>
                <Text style={[styles.singleSelectedText, { color: themeColors.text }]} numberOfLines={1}>
                  {selectedItem.label}
                </Text>
                {selectedItem.subLabel && (
                  <Text style={[styles.singleSelectedSub, { color: themeColors.subText }]}>
                    {selectedItem.subLabel}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={[styles.placeholderText, { color: themeColors.subText }]}>
                {placeholder}
              </Text>
            )
          ) : selectedItemsList.length > 0 ? (
            <View style={styles.chipWrap}>
              {selectedItemsList.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: tagColors.bg,
                      borderColor: tagColors.border,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: tagColors.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleRemoveItem(item.id);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.chipRemove, { color: tagColors.text }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.placeholderText, { color: themeColors.subText }]}>
              {placeholder}
            </Text>
          )}
        </View>

        <View style={styles.triggerIcons}>
          {!multiSelect && selectedItem && (
            <TouchableOpacity
              onPress={() => onSelect?.('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginRight: 6 }}
            >
              <Text style={{ color: themeColors.subText, fontSize: 14, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          )}
          <Text style={{ color: themeColors.subText, fontSize: 12 }}>▼</Text>
        </View>
      </TouchableOpacity>

      {/* Modal Picker */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: themeColors.bg }]}>
          <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

          {/* Modal Header */}
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              style={[styles.closeBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
            >
              <Text style={{ fontSize: 16, color: themeColors.text }}>✕</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]} numberOfLines={1}>
                {label}
              </Text>
              <Text style={[styles.modalSub, { color: themeColors.subText }]}>
                {filteredItems.length} options available
              </Text>
            </View>
            {multiSelect && (
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.doneBtn}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Search Box */}
          <View style={[styles.searchBoxWrap, { borderBottomColor: themeColors.border }]}>
            <TextInput
              style={[
                styles.modalSearchInput,
                {
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                  color: themeColors.text,
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
              ]}
              placeholder={`Search ${label}...`}
              placeholderTextColor={themeColors.subText}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus={true}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Add New Option Button if provided */}
          {onAddNew && (
            <TouchableOpacity
              style={styles.addNewRow}
              onPress={() => {
                setModalVisible(false);
                onAddNew();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.addNewText}>+ {addNewLabel || `Add New ${label}`}</Text>
            </TouchableOpacity>
          )}

          {/* Items List */}
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: themeColors.subText }]}>
                  No matches found for "{searchQuery}"
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isSelected = multiSelect
                ? selectedIds.includes(item.id)
                : selectedId === item.id;

              return (
                <TouchableOpacity
                  style={[
                    styles.listItem,
                    {
                      backgroundColor: isSelected
                        ? tagColors.bg
                        : isDark
                        ? '#1E293B'
                        : '#FFFFFF',
                      borderColor: isSelected
                        ? tagColors.border
                        : isDark
                        ? '#334155'
                        : '#E2E8F0',
                    },
                  ]}
                  onPress={() => handleToggleItem(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.itemTitle,
                        {
                          color: isSelected ? tagColors.text : themeColors.text,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.subLabel && (
                      <Text style={[styles.itemSub, { color: themeColors.subText }]}>
                        {item.subLabel}
                      </Text>
                    )}
                  </View>
                  {isSelected && (
                    <View style={[styles.checkBadge, { backgroundColor: tagColors.text }]}>
                      <Text style={styles.checkText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  triggerBox: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  singleSelectedRow: {
    flexDirection: 'column',
  },
  singleSelectedText: {
    fontSize: 13,
    fontWeight: '600',
  },
  singleSelectedSub: {
    fontSize: 11,
    marginTop: 2,
  },
  placeholderText: {
    fontSize: 13,
  },
  triggerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chipRemove: {
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  modalSafeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalSub: {
    fontSize: 11,
    marginTop: 2,
  },
  doneBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  doneBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12,
  },
  searchBoxWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  modalSearchInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '500',
  },
  addNewRow: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
  },
  addNewText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '800',
  },
  listItem: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: {
    fontSize: 13,
  },
  itemSub: {
    fontSize: 11,
    marginTop: 3,
  },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  checkText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
});
